import { normalizeLegalHtml } from "@/lib/legalHtml";

type LegalContentProps = {
  content: string;
};

export default function LegalContent({ content }: LegalContentProps) {
  return (
    <div
      className="legal-content"
      dangerouslySetInnerHTML={{ __html: normalizeLegalHtml(content) }}
    />
  );
}
