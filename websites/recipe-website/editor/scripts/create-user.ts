import { hash, genSalt } from "bcrypt";
import { read } from "read";
import process from "node:process";
import { parseArgs, ParseArgsOptionsConfig } from "node:util";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { readUser, writeUser, type UserRecord } from "../src/users";

interface UserInput {
  email: string;
  password: string;
}

const options: ParseArgsOptionsConfig = {
  email: {
    type: "string",
    short: "e",
  },
  password: {
    type: "string",
    short: "p",
  },
  help: {
    type: "boolean",
    short: "h",
  },
} as const;

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePassword(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (!/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/*
 * `src/users` owns the path, and it is a bare email with no extension (D10).
 * This wrote `<email>.json` while `src/auth.ts` read `<email>`, so every user
 * this script created was invisible to sign-in.
 */
async function userExists(email: string): Promise<boolean> {
  return (await readUser(getContentDirectory(), email)) !== null;
}

async function getInput(): Promise<UserInput> {
  const { values } = parseArgs({ options });
  const typedValues = values as {
    email?: string;
    password?: string;
    help?: boolean;
  };

  if (typedValues.help) {
    console.log(`
Usage: node create-user.ts [options]

Options:
  -e, --email <email>       User email address
  -p, --password <password> User password
  -h, --help               Show this help message

Examples:
  node create-user.ts
  node create-user.ts --email user@example.com
  node create-user.ts -e user@example.com -p mypassword
    `);
    process.exit(0);
  }

  if (typedValues.password && !typedValues.email) {
    throw new Error(
      "Email is required when password is provided via command line",
    );
  }

  let email = typedValues.email;
  if (!email) {
    email = await read<string>({ prompt: "Enter an email: " });
  }

  if (!email?.trim()) {
    throw new Error("Email is required");
  }

  email = email.trim().toLowerCase();

  if (!validateEmail(email)) {
    throw new Error("Please enter a valid email address");
  }

  // Check if user already exists
  if (await userExists(email)) {
    throw new Error(`User with email ${email} already exists`);
  }

  let password = typedValues.password;
  if (!password) {
    password = await read<string>({
      prompt: "Enter a password: ",
      silent: true,
      replace: "*",
    });
  }

  if (!password?.trim()) {
    throw new Error("Password is required");
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    throw new Error(
      `Password validation failed:\n${passwordValidation.errors.join("\n")}`,
    );
  }

  return { email, password };
}

export async function createUser(): Promise<void> {
  try {
    console.log("Creating new user...");

    const { email, password } = await getInput();

    console.log("Generating secure password hash...");
    const salt = await genSalt(12); // Increased rounds for better security
    const hashedPassword = await hash(password, salt);

    const userData: UserRecord = {
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
    };

    const filepath = await writeUser(getContentDirectory(), userData);

    console.log(`✅ User created successfully!`);
    console.log(`📧 Email: ${email}`);
    console.log(`📁 Saved to: ${filepath}`);
  } catch (error) {
    console.error("❌ Error creating user:");
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error("An unknown error occurred");
    }
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  createUser();
}
