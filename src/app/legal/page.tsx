import { getStoreSettings } from "@/lib/db/catalog";
import { legalParagraphs, renderLegalContent } from "@/lib/legalPages";

export const metadata = { title: "Mentions légales - ghost.ma" };

export default async function LegalNoticePage() {
  const settings = await getStoreSettings();
  const page = settings.legalPages.legal;
  const paragraphs = legalParagraphs(renderLegalContent(page.content, settings));

  return (
    <div className="container-page py-12">
      <article className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-white">{page.title}</h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
          {paragraphs.map((paragraph) => (
            <p key={paragraph} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>
      </article>
    </div>
  );
}
