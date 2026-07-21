"""TITAN V31 — Scrapling IG integration (Pass 1c-IG).

Fetches IG posts + profile via Scrapling StealthyFetcher and parses
og:description to extract like/comment/caption/postedAt (posts) and
followers/following/postsCount/displayName (profile).

Inputs (argv, key=value):
  slug=<slug>          e.g. ig-majangmejeng_
  account-url=<url>    IG profile URL
  posts-json=<path>    JSON file: [{shortcode, url}, ...]

Output: JSON to stdout
  {"slug": "...", "profile": {...} | null, "posts": [{shortcode, likeCount, commentCount, caption, postedAt, username}, ...]}

Per-post failures: skipped silently with a WARN on stderr. Per-account
safety: one failure must not block the next post/profile.

Usage:
  python scripts/scrape-ig-scrapling.py slug=ig-majangmejeng_ \\
    account-url=https://www.instagram.com/majangmejeng_/ \\
    posts-json=/tmp/posts.json
"""
import sys
import json
import re
import time
from pathlib import Path
from scrapling import StealthyFetcher

# Regex: "N likes, N comments - user on date: caption"
# - likes: 1,234
# - comments: 56
# - user: mayangmejeng_
# - date: "January 15, 2025" or "Jan 15, 2025"
# - caption: free text, can contain colons
POST_RE = re.compile(
    r'^([\d,]+)\s+likes?,\s+([\d,]+)\s+comments?\s+-\s+(\S+)\s+on\s+([^:]+):\s*(.*)$',
    re.DOTALL
)

# Regex: "N Followers, N Following, N Posts - See Instagram photos and videos from Name (@user)"
PROFILE_RE = re.compile(
    r'^([\d,]+)\s+Followers?,\s+([\d,]+)\s+Following,\s+([\d,]+)\s+Posts\s+-\s+(.*)$',
    re.DOTALL
)

# Inner regex: extract "Display Name (@username)" from "See Instagram photos and videos from ..."
NAME_RE = re.compile(r'from\s+(.+?)\s+\(@(\S+?)\)')


def parse_post(desc):
    """Parse a post og:description into structured fields."""
    if not desc:
        return None
    m = POST_RE.match(desc)
    if not m:
        return None
    likes, comments, user, date, caption = m.groups()
    return {
        'likeCount': int(likes.replace(',', '')),
        'commentCount': int(comments.replace(',', '')),
        'username': user,
        'postedAt': date.strip(),
        'caption': caption.strip(),
    }


def parse_profile(desc):
    """Parse a profile og:description into structured fields."""
    if not desc:
        return None
    m = PROFILE_RE.match(desc)
    if not m:
        return None
    fol, foll, posts, rest = m.groups()
    display = ''
    user = ''
    name_m = NAME_RE.search(rest)
    if name_m:
        display = name_m.group(1).strip()
        user = name_m.group(2).strip()
    return {
        'followersCount': int(fol.replace(',', '')),
        'followingCount': int(foll.replace(',', '')),
        'postsCount': int(posts.replace(',', '')),
        'displayName': display,
        'username': user,
    }


def get_og_description(url, timeout=30000):
    """Fetch URL with StealthyFetcher and return og:description content."""
    page = StealthyFetcher.fetch(url, headless=True, timeout=timeout)
    return page.css('meta[property="og:description"]::attr(content)').get() or ''


def main():
    args = dict(a.split('=', 1) for a in sys.argv[1:] if '=' in a)
    slug = args.get('slug')
    profile_url = args.get('account-url')
    posts_path = args.get('posts-json')

    if not (slug and profile_url and posts_path):
        print(
            f'ERROR: missing required argv (slug={slug}, account-url={profile_url}, posts-json={posts_path})',
            file=sys.stderr,
        )
        sys.exit(2)

    try:
        posts = json.loads(Path(posts_path).read_text(encoding='utf-8'))
    except Exception as e:
        print(f'ERROR: cannot read posts-json: {e}', file=sys.stderr)
        sys.exit(2)

    out = {'slug': slug, 'profile': None, 'posts': []}

    # 1. Profile
    try:
        desc = get_og_description(profile_url)
        out['profile'] = parse_profile(desc)
        if out['profile'] is None:
            print(f'WARN profile: og:description did not match pattern: {desc[:120]!r}', file=sys.stderr)
    except Exception as e:
        print(f'WARN profile: {e}', file=sys.stderr)

    # 2. Posts (sequential, 1s delay for rate limit)
    for p in posts:
        shortcode = p.get('shortcode')
        url = p.get('url')
        if not url or not shortcode:
            continue
        try:
            desc = get_og_description(url)
            parsed = parse_post(desc)
            if parsed:
                parsed['shortcode'] = shortcode
                out['posts'].append(parsed)
            else:
                print(f'WARN {shortcode}: og:description did not match pattern', file=sys.stderr)
        except Exception as e:
            print(f'WARN {shortcode}: {e}', file=sys.stderr)
        time.sleep(1)

    print(json.dumps(out, ensure_ascii=False))


if __name__ == '__main__':
    main()
