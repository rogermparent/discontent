import { useState } from "react";
import { Errors, FieldWrapper } from "../..";
import { Textarea } from "@discontent/component-library/components/ui/textarea";
import StyledMarkdown from "@discontent/component-library/components/Markdown";
import { Button } from "@discontent/component-library/components/ui/button";
import { DefaultControls, MarkdownInputProps } from "./common";

export function MarkdownInput({
  name,
  id = name,
  defaultValue,
  label,
  errors,
  Controls = DefaultControls,
  components,
}: MarkdownInputProps) {
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [textArea, setTextArea] = useState<HTMLTextAreaElement | null>(null);

  return (
    <FieldWrapper label={label} id={id}>
      <Errors errors={errors} />
      <div className="flex flex-col border rounded-xs">
        <div className="flex gap-1 border-b p-1">
          <Button
            type="button"
            size="sm"
            variant={activeTab === "edit" ? "default" : "ghost"}
            aria-pressed={activeTab === "edit"}
            onClick={() => setActiveTab("edit")}
          >
            Write
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTab === "preview" ? "default" : "ghost"}
            aria-pressed={activeTab === "preview"}
            onClick={() => setActiveTab("preview")}
          >
            Preview
          </Button>
        </div>
        <div className={activeTab === "edit" ? "" : "hidden"}>
          <div className="flex flex-wrap gap-2 border-b p-2">
            <Controls textArea={textArea} />
          </div>
          <Textarea
            name={name}
            id={id}
            ref={(el) => {
              setTextArea(el);
            }}
            className="h-40 w-full grow"
            defaultValue={defaultValue}
          />
        </div>
        {activeTab === "preview" ? (
          <div className={"p-2 markdown-body"}>
            <StyledMarkdown components={components}>
              {textArea?.value || ""}
            </StyledMarkdown>
          </div>
        ) : null}
      </div>
    </FieldWrapper>
  );
}
