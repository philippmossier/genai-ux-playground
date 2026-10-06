import { cn } from "~/lib/utils";
import { Card, CardContent } from "./ui/card";

/** Plain-text renderer with **bold** support. Deliberately not a markdown library: the output is untrusted. */
export function Prose({ text, streaming }: { text: string; streaming?: boolean }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Card>
      <CardContent
        className={cn(
          "text-sm leading-relaxed whitespace-pre-wrap",
          streaming && "caret",
        )}
      >
        {parts.map((part, i) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </CardContent>
    </Card>
  );
}
