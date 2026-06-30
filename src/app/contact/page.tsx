"use client";

export default function ContactPage() {
  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-xl">
        <h1 className="text-3xl font-bold text-white">Contactez-nous</h1>
        <p className="mt-2 text-sm text-muted">
          Une question? Envoyez-nous un message, nous vous répondrons rapidement.
        </p>

        <form className="mt-8 space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">
              Nom
            </label>
            <input className="input" placeholder="Votre nom" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">
              Email
            </label>
            <input className="input" type="email" placeholder="vous@example.com" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">
              Message
            </label>
            <textarea
              className="input min-h-32 resize-y"
              placeholder="Comment pouvons-nous vous aider?"
            />
          </div>
          <button className="btn-primary w-full" type="submit">
            Envoyer le message
          </button>
        </form>

        <p className="mt-4 rounded-lg bg-surface px-3 py-2 text-center text-xs text-muted">
          Interface de démonstration: les messages ne sont pas envoyés en phase
          1. Écrivez directement à support@ghost.ma.
        </p>
      </div>
    </div>
  );
}
