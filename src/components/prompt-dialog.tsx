import { Maximize2Icon } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Field, FieldDescription, FieldLabel } from "./ui/field";
import { Textarea } from "./ui/textarea";

/**
 * A large editor for the system prompt and the input, for pasting and reading long prompts.
 * It edits the same state as the sidebar textareas, so there is nothing to save or discard.
 */
export function PromptDialog(p: {
  system: string;
  user: string;
  /** Id of the labelled case the input matches, or null for custom input. */
  caseId: string | null;
  onSystem: (text: string) => void;
  onUser: (text: string) => void;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Open prompts in a larger editor"
            title="Open prompts in a larger editor"
          />
        }
      >
        <Maximize2Icon />
      </DialogTrigger>
      <DialogContent className="flex h-[85vh] flex-col sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Prompts
            {p.caseId ? (
              <Badge variant="secondary">Labelled case {p.caseId}, scored</Badge>
            ) : (
              <Badge variant="outline">Custom input, not scored</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Changes apply immediately. Editing the input of a labelled case turns it into
            custom input.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
          <Field className="flex min-h-0 flex-col">
            <FieldLabel htmlFor="system-large">System</FieldLabel>
            <Textarea
              id="system-large"
              className="min-h-40 flex-1 resize-none field-sizing-fixed font-mono text-xs"
              value={p.system}
              onChange={(e) => p.onSystem(e.target.value)}
            />
            <FieldDescription>
              The output format instruction is added automatically per mode.
            </FieldDescription>
          </Field>
          <Field className="flex min-h-0 flex-col">
            <FieldLabel htmlFor="input-large">Input</FieldLabel>
            <Textarea
              id="input-large"
              className="min-h-40 flex-1 resize-none field-sizing-fixed font-mono text-xs"
              value={p.user}
              onChange={(e) => p.onUser(e.target.value)}
            />
            <FieldDescription>
              {p.user.length.toLocaleString()} characters
            </FieldDescription>
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}
