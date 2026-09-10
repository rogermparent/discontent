import { useReducer, ReactNode, ActionDispatch } from "react";
import { Button } from "../../../Button";
import { FieldWrapper } from "../..";
import { cn } from "@discontent/component-library/lib/utils";
import { Input } from "@discontent/component-library/components/ui/input";

interface KeyListValue<T> {
  key: number;
  defaultValue?: T;
}

interface KeyListState<T = string> {
  currentKey: number;
  values: KeyListValue<T>[];
}

export type KeyListAction<T = string> =
  | { type: "APPEND" }
  | { type: "MOVE"; from: number; to: number }
  | { type: "DELETE"; index: number }
  | { type: "INSERT"; index: number }
  | { type: "RESET"; values: T[] };

/**
 * A square glyph button for list-row controls. Takes an explicit `aria-label`
 * because its children are bare glyphs (`+`, `↑`, `×`) that make poor
 * accessible names, and `className` so a caller can drop the default gutter
 * when the buttons are joined into a ButtonGroup.
 */
export const ListInputButton = ({
  onClick,
  children,
  className,
  "aria-label": ariaLabel,
}: {
  onClick: () => void;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) => (
  <Button
    type="button"
    aria-label={ariaLabel}
    className={cn("ml-0.5 h-10 w-10 sm:h-8 sm:w-8", className)}
    onClick={onClick}
  >
    {children}
  </Button>
);

// Update InputListControls to use ListInputButton
export function InputListControls<T>({
  dispatch,
  index,
}: {
  dispatch: ActionDispatch<[action: KeyListAction<T>]>;
  index: number;
}) {
  return (
    <>
      <ListInputButton
        onClick={() => {
          dispatch({ type: "INSERT", index });
        }}
      >
        +
      </ListInputButton>
      <ListInputButton
        onClick={() => {
          dispatch({ type: "MOVE", from: index, to: index - 1 });
        }}
      >
        &uarr;
      </ListInputButton>
      <ListInputButton
        onClick={() => {
          dispatch({ type: "MOVE", from: index, to: index + 1 });
        }}
      >
        &darr;
      </ListInputButton>
      <ListInputButton
        onClick={() => {
          dispatch({ type: "DELETE", index });
        }}
      >
        &times;
      </ListInputButton>
    </>
  );
}

function reduceKeyList<T>(
  state: KeyListState<T>,
  action: KeyListAction<T>,
): KeyListState<T> {
  const { currentKey, values } = state;
  switch (action.type) {
    case "APPEND":
      return {
        currentKey: currentKey + 1,
        values: [...values, { key: currentKey }],
      };
    case "INSERT": {
      const { index } = action;
      return {
        currentKey: currentKey + 1,
        values: [
          ...values.slice(0, index),
          { key: currentKey },
          ...values.slice(index),
        ],
      };
    }
    case "MOVE": {
      const { from: fromIndex, to: toIndex } = action;
      if (fromIndex === toIndex) {
        return state;
      }
      const newValues = [...values];
      const valueToMove = values[fromIndex];
      newValues.splice(fromIndex, 1);
      newValues.splice(toIndex, 0, valueToMove);
      return {
        currentKey,
        values: newValues,
      };
    }
    case "DELETE": {
      const { index } = action;
      return {
        currentKey,
        values: [...values.slice(0, index), ...values.slice(index + 1)],
      };
    }
    case "RESET": {
      const { values: newValues } = action;
      let i = currentKey;
      const values: { key: number; defaultValue?: T }[] = newValues.map(
        (defaultValue) => ({ key: i++, defaultValue }),
      );
      return {
        currentKey: i,
        values,
      };
    }
    default: {
      return state;
    }
  }
}

export function useKeyList<T>(defaultValues?: T[] | undefined) {
  return useReducer(
    reduceKeyList<T>,
    { currentKey: 0, values: [] },
    (initialArg) => {
      if (defaultValues && defaultValues.length > 0) {
        const values = [];
        for (let i = 0; i < defaultValues.length; i++) {
          values.push({ key: i, defaultValue: defaultValues[i] });
        }
        return {
          currentKey: defaultValues.length,
          values,
        };
      }
      return initialArg;
    },
  );
}

export function TextListInput({
  name,
  id = name,
  defaultValue,
  label,
  appendLabel = "Append Item",
}: {
  name: string;
  id?: string;
  label: string;
  defaultValue?: string[];
  placeholder?: string;
  appendLabel?: string;
}) {
  const [{ values }, dispatch] = useKeyList(defaultValue);
  return (
    <FieldWrapper label={label} id={id}>
      <ul>
        {values.map(({ key, defaultValue }, index) => (
          <li
            key={key}
            className="flex flex-row flex-wrap my-1 justify-center items-center"
          >
            <Input
              type="text"
              defaultValue={defaultValue}
              className="grow"
              name={`${name}[${index}]`}
            />
            <div className="flex flex-row flex-nowrap justify-center">
              <InputListControls dispatch={dispatch} index={index} />
            </div>
          </li>
        ))}
      </ul>
      <Button
        onClick={() => {
          dispatch({ type: "APPEND" });
        }}
      >
        {appendLabel}
      </Button>
    </FieldWrapper>
  );
}

export interface ListItemProps<ValueType> {
  name: string;
  defaultValue?: ValueType;
}

export function ListInput<ValueType>({
  name,
  defaultValue,
  label,
  Item,
}: {
  name: string;
  label?: string;
  defaultValue?: ValueType[];
  Item: (props: ListItemProps<ValueType>) => ReactNode;
}) {
  const [{ values }, dispatch] = useKeyList<ValueType>(defaultValue);

  return (
    <FieldWrapper label={label}>
      <ul>
        {values.map(({ key, defaultValue }, index) => {
          const itemName = `${name}[${index}]`;
          return (
            <li key={key}>
              <div className="border-l-2 border-white pl-2 my-2">
                <Item defaultValue={defaultValue} name={itemName} />
                <div className="flex flex-row flex-nowrap justify-center">
                  <InputListControls dispatch={dispatch} index={index} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <Button
        onClick={() => {
          dispatch({ type: "APPEND" });
        }}
      >
        Append
      </Button>
    </FieldWrapper>
  );
}
