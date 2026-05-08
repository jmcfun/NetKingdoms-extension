// Tier S — top 1000 global domains (10 pts/snapshot)
const TIER_S = new Set([
  'google.com','youtube.com','facebook.com','instagram.com','twitter.com','x.com',
  'reddit.com','wikipedia.org','tiktok.com','amazon.com','linkedin.com','github.com',
  'netflix.com','twitch.tv','discord.com','whatsapp.com','telegram.org','microsoft.com',
  'apple.com','yahoo.com','bing.com','duckduckgo.com','stackoverflow.com','pinterest.com',
  'tumblr.com','wordpress.com','medium.com','substack.com','quora.com','imgur.com',
])

// Tier A — top 10 000 global domains (5 pts/snapshot)
const TIER_A = new Set([
  'gitlab.com','bitbucket.org','npmjs.com','pypi.org','packagist.org','rubygems.org',
  'crates.io','hub.docker.com','kubernetes.io','terraform.io','ansible.com',
  'developer.mozilla.org','developer.apple.com','docs.python.org','golang.org',
  'rust-lang.org','typescriptlang.org','reactjs.org','vuejs.org','angular.io',
  'nextjs.org','svelte.dev','astro.build','remix.run','solidjs.com','qwik.builder.io',
  'tailwindcss.com','shadcn.com','radix-ui.com','framer.com','figma.com',
  'notion.so','airtable.com','trello.com','asana.com','jira.atlassian.com',
  'confluence.atlassian.com','slack.com','zoom.us','meet.google.com','teams.microsoft.com',
  'dropbox.com','drive.google.com','onedrive.com','box.com','mega.nz',
  'vercel.com','netlify.com','railway.app','render.com','fly.io','heroku.com',
  'aws.amazon.com','cloud.google.com','azure.microsoft.com','digitalocean.com',
  'supabase.com','firebase.google.com','planetscale.com','neon.tech','upstash.com',
  'stripe.com','lemonsqueezy.com','paddle.com','braintree.com','paypal.com',
  'sendgrid.com','mailchimp.com','postmarkapp.com','resend.com','mailgun.com',
  'sentry.io','datadog.com','grafana.com','pagerduty.com','newrelic.com',
  'hacker-news.firebaseapp.com','news.ycombinator.com','lobste.rs','tildes.net',
  'dev.to','hashnode.com','daily.dev','indiehackers.com','producthunt.com',
  'spotify.com','soundcloud.com','bandcamp.com','deezer.com','tidal.com',
  'letterboxd.com','imdb.com','rottentomatoes.com','metacritic.com','goodreads.com',
  'amazon.fr','amazon.de','amazon.co.uk','amazon.co.jp','amazon.ca',
  'bbc.com','reuters.com','apnews.com','theguardian.com','nytimes.com',
  'washingtonpost.com','bloomberg.com','ft.com','economist.com','forbes.com',
  'techcrunch.com','theverge.com','wired.com','arstechnica.com','engadget.com',
  '9to5mac.com','macrumors.com','tomshardware.com','anandtech.com','pcmag.com',
])

// Tier B — top 100 000 global domains (2 pts/snapshot)
const TIER_B = new Set([
  'codepen.io','codesandbox.io','stackblitz.com','replit.com','glitch.com',
  'jsfiddle.net','playcode.io','jsbin.com','plnkr.co','codetogo.io',
  'leetcode.com','hackerrank.com','codewars.com','exercism.org','projecteuler.net',
  'khanacademy.org','freecodecamp.org','coursera.org','udemy.com','edx.org',
  'udacity.com','pluralsight.com','egghead.io','frontendmasters.com','scrimba.com',
  'archive.org','gutenberg.org','openlibrary.org','libgen.fun','z-lib.org',
  'vimeo.com','dailymotion.com','odysee.com','rumble.com','peertube.social',
  'itch.io','steampowered.com','epicgames.com','gog.com','humble.com',
  'chess.com','lichess.org','boardgamearena.com','tabletopia.com',
  'stackoverflow.blog','css-tricks.com','smashingmagazine.com','a11yproject.com',
  'web.dev','chromium.org','webkit.org','bugzilla.mozilla.org',
  'regexr.com','regex101.com','crontab.guru','jsonlint.com','jwt.io',
  'caniuse.com','bundlephobia.com','packagephobia.com','npm.runkit.com',
  'carbon.now.sh','ray.so','shots.so','screenshotone.com',
])

// Tech & Dev zone
const ZONE_TECH = new Set([
  'github.com','gitlab.com','bitbucket.org','stackoverflow.com','npmjs.com',
  'pypi.org','packagist.org','rubygems.org','crates.io','hub.docker.com',
  'kubernetes.io','developer.mozilla.org','golang.org','rust-lang.org',
  'typescriptlang.org','reactjs.org','vuejs.org','angular.io','nextjs.org',
  'svelte.dev','astro.build','tailwindcss.com','figma.com','vercel.com',
  'netlify.com','railway.app','render.com','fly.io','supabase.com',
  'aws.amazon.com','cloud.google.com','azure.microsoft.com','digitalocean.com',
  'codepen.io','codesandbox.io','stackblitz.com','replit.com','leetcode.com',
  'hackerrank.com','freecodecamp.org','web.dev','chromium.org','webkit.org',
  'css-tricks.com','smashingmagazine.com','caniuse.com','bundlephobia.com',
  'news.ycombinator.com','lobste.rs','dev.to','hashnode.com','daily.dev',
  'docker.com','linux.org','hackernews.com','npmjs.com','developer.apple.com',
  'crontab.guru','jwt.io','regex101.com','regexr.com','sentry.io',
  'notion.so','airtable.com','slack.com','jira.atlassian.com','discord.com',
  'indiehackers.com','producthunt.com','stripe.com','sendgrid.com',
])

// Social & News zone
const ZONE_SOCIAL = new Set([
  'reddit.com','twitter.com','x.com','linkedin.com','facebook.com','instagram.com',
  'tiktok.com','pinterest.com','tumblr.com','mastodon.social','mastodon.online',
  'bsky.app','threads.net','snapchat.com',
  'bbc.com','reuters.com','apnews.com','theguardian.com','nytimes.com',
  'washingtonpost.com','bloomberg.com','ft.com','economist.com','forbes.com',
  'techcrunch.com','theverge.com','wired.com','arstechnica.com','engadget.com',
  'medium.com','substack.com','quora.com','wordpress.com',
  'lemonde.fr','lefigaro.fr','liberation.fr','leparisien.fr','lexpress.fr',
  'spiegel.de','zeit.de','faz.net','sueddeutsche.de',
  'elpais.com','elmundo.es','lavanguardia.com',
  'corriere.it','repubblica.it','gazzetta.it',
  'news.ycombinator.com',
])

// Culture & Niche zone
const ZONE_CULTURE = new Set([
  'youtube.com','twitch.tv','spotify.com','soundcloud.com','bandcamp.com',
  'deezer.com','tidal.com','apple.com','music.apple.com',
  'letterboxd.com','imdb.com','rottentomatoes.com','metacritic.com',
  'steampowered.com','epicgames.com','gog.com','itch.io','humble.com',
  'chess.com','lichess.org','boardgamearena.com',
  'goodreads.com','archive.org','gutenberg.org','openlibrary.org',
  'vimeo.com','dailymotion.com','odysee.com',
  'animesuki.com','myanimelist.net','anilist.co','crunchyroll.com',
  'deviantart.com','artstation.com','behance.net','dribbble.com',
  'khanacademy.org','coursera.org','udemy.com','edx.org',
])

// Regional TLD patterns → Neutre
const REGIONAL_TLDS = /\.(fr|de|jp|br|it|es|pt|nl|be|ch|at|pl|ru|cn|kr|au|nz|mx|ar|cl|co\.uk|co\.jp|co\.kr|com\.br|com\.au)$/

export interface Classification {
  tier: 'S' | 'A' | 'B' | 'C' | 'D'
  zone: 'Tech & Dev' | 'Social & News' | 'Culture & Niche' | 'Neutre'
  value: number // pts per snapshot
}

export function classifyDomain(domain: string): Classification {
  const d = domain.toLowerCase()

  const zone = getZone(d)
  if (TIER_S.has(d)) return { tier: 'S', zone, value: 10 }
  if (TIER_A.has(d)) return { tier: 'A', zone, value: 5 }
  if (TIER_B.has(d)) return { tier: 'B', zone, value: 2 }

  // Tier C: known regional TLDs or short country-specific hostnames
  if (REGIONAL_TLDS.test(d)) return { tier: 'C', zone: 'Neutre', value: 1 }

  // Tier D: niche — random value 1-8
  const value = Math.floor(Math.random() * 8) + 1
  return { tier: 'D', zone, value }
}

function getZone(domain: string): Classification['zone'] {
  if (ZONE_TECH.has(domain)) return 'Tech & Dev'
  if (ZONE_SOCIAL.has(domain)) return 'Social & News'
  if (ZONE_CULTURE.has(domain)) return 'Culture & Niche'
  if (REGIONAL_TLDS.test(domain)) return 'Neutre'
  return 'Culture & Niche'
}
