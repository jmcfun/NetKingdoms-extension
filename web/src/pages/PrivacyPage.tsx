export default function PrivacyPage() {
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <p className="eyebrow">NetKingdoms</p>
      <h1>Politique de confidentialité</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 32 }}>Dernière mise à jour : mai 2026</p>

      {[
        {
          title: '1. Données collectées',
          content: `NetKingdoms collecte uniquement le nom de domaine racine des sites que tu visites (ex : github.com), jamais l'URL complète, le contenu des pages, ni aucune donnée personnelle de navigation. Le chemin, les paramètres d'URL et le contenu ne sont jamais transmis.`,
        },
        {
          title: '2. Utilisation des données',
          content: `Les domaines visités sont utilisés exclusivement pour calculer la progression de jeu (domination de territoire, score de saison). Aucune donnée n'est vendue ou transmise à des tiers.`,
        },
        {
          title: '3. Stockage et conservation',
          content: `Les événements de navigation (browse_events) sont automatiquement supprimés 30 jours après leur création. Les territoires inactifs depuis 72h sont retirés de la carte. Les données sont hébergées sur Supabase (hébergement EU — Ireland).`,
        },
        {
          title: '4. Mode anonyme',
          content: `L'extension fonctionne sans création de compte. Dans ce cas, un identifiant anonyme aléatoire (UUID) est généré localement. Cet identifiant n'est lié à aucune identité personnelle et peut être réinitialisé en supprimant les données de l'extension.`,
        },
        {
          title: '5. Droit à l\'oubli',
          content: `Tu peux demander la suppression de toutes tes données à tout moment par email. La suppression est effectuée sous 72 heures. Le compte et toutes les données associées sont définitivement effacés.`,
        },
        {
          title: '6. Cookies et tracking',
          content: `NetKingdoms n'utilise aucun cookie, aucun pixel de tracking, aucune technologie de fingerprinting. L'extension n'injecte aucun script dans les pages web que tu visites.`,
        },
        {
          title: '7. Permissions Chrome',
          content: `L'extension requiert les permissions suivantes : "tabs" et "webNavigation" pour détecter les changements de domaine ; "storage" pour mémoriser ta progression localement ; "notifications" pour les alertes de jeu. Aucune permission de lecture du contenu des pages n'est demandée.`,
        },
        {
          title: '8. Contact',
          content: `Pour toute question ou demande de suppression : privacy@netkingdoms.gg`,
        },
      ].map((section) => (
        <div key={section.title} style={{ marginBottom: 28 }}>
          <h2 style={{ marginBottom: 10, fontSize: '1.1rem' }}>{section.title}</h2>
          <p style={{ color: 'var(--muted)', lineHeight: 1.7, fontSize: '0.95rem' }}>{section.content}</p>
        </div>
      ))}
    </div>
  )
}
