// Check the size param in og:image URLs from different UAs
const tests = [
  { url: 'https://www.instagram.com/majangmejeng_/', ua: 'facebookexternalhit/1.1' },
  { url: 'https://www.instagram.com/majangmejeng_/', ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
  { url: 'https://www.instagram.com/majangmejeng_/', ua: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' },
  { url: 'https://www.instagram.com/majangmejeng_/', ua: 'Twitterbot/1.0' },
  { url: 'https://www.instagram.com/majangmejeng_/', ua: 'LinkedInBot/1.0 (compatible; Mozilla/5.0; +https://www.linkedin.com/bot)' }
];
for (const t of tests) {
  const res = await fetch(t.url, { headers: { 'User-Agent': t.ua, 'Accept': 'text/html' } });
  const html = await res.text();
  const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  const u = m ? m[1].replace(/&amp;/g, '&') : null;
  const sizeMatch = u?.match(/stp=[^&]+/);
  console.log(t.ua.slice(0, 40).padEnd(42), 'stp:', sizeMatch?.[0] ?? 'NONE');
}
