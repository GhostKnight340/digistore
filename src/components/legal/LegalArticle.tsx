import type { StoreSettings } from "@/lib/storeSettings";
import { renderLegalContent } from "@/lib/legalPages";
import LegalContent from "./LegalContent";

type LegalArticleProps = {
  page: StoreSettings["legalPages"][string];
  settings: StoreSettings;
};

export default function LegalArticle({ page, settings }: LegalArticleProps) {
  return (
    <div className="container-page py-10 sm:py-14">
      <article className="mx-auto max-w-5xl">
        <header className="border-b border-border pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            ghost.ma
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {page.title}
          </h1>
          {page.seoDescription ? (
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted sm:text-base">
              {page.seoDescription}
            </p>
          ) : null}
        </header>
        <LegalContent content={renderLegalContent(page.content, settings)} />
      </article>
    </div>
  );
}
