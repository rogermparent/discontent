import { join } from "path";
import { access } from "fs-extra";
import simpleGit from "simple-git";
import { getContentDirectory } from "../fs/getContentDirectory";

export async function directoryIsGitRepo(contentDirectory: string) {
  try {
    await access(join(contentDirectory, ".git"));
    return true;
  } catch {
    return false;
  }
}

export async function commitChanges(
  contentDirectory: string,
  message: string,
  author?: { name: string; email: string },
  paths?: string[],
) {
  const git = simpleGit({ baseDir: contentDirectory });
  await git.add(paths && paths.length > 0 ? paths : "./*");

  if (author) {
    await git.commit(message, {
      "--author": `${author.name} <${author.email}>`,
    });
  } else {
    await git.commit(message);
  }
}

/**
 * Commit a content write, if the content directory is a git repository.
 *
 * `contentDirectory` is trailing and optional because it arrived late (F17):
 * until then this read `getContentDirectory()` unconditionally, so a write
 * given an explicit directory committed against whatever the ambient
 * environment named — and `paths`, which the caller computed relative to *its*
 * directory, went to a repository they may not belong to. Latent rather than
 * live: the two agree in every configuration that runs today.
 */
export async function commitContentChanges(
  message: string,
  author?: { name: string; email: string },
  paths?: string[],
  contentDirectory: string = getContentDirectory(),
) {
  if (await directoryIsGitRepo(contentDirectory)) {
    await commitChanges(contentDirectory, message, author, paths);
  }
}
