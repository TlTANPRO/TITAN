"""Scrapling smoke test for TITAN V31.

Tests Scrapling's ability to fetch:
1. Instagram profile + 1 post detail
2. TikTok profile + 1 video detail

If both work, we can integrate Scrapling as a new provider in the V31 hybrid pipeline.

Usage: python scripts/test-scrapling.py
"""
import sys
import time
from scrapling import Fetcher, StealthyFetcher

IG_TEST_POST = "https://www.instagram.com/p/DavGLefkwbZ/"
IG_TEST_PROFILE = "https://www.instagram.com/majangmejeng_/"
TT_TEST_POST = "https://www.tiktok.com/@majangmejeng_/video/7664121536290327816"
TT_TEST_PROFILE = "https://www.tiktok.com/@majangmejeng_"

results = []

def record(name, status, detail):
    results.append({"name": name, "status": status, "detail": detail})
    icon = "PASS" if status == "PASS" else "FAIL"
    print(f"  {icon} {name}: {status} -- {detail}")


def test_fetcher(url, label):
    """Test basic Fetcher (HTTP, no JS)."""
    try:
        page = Fetcher.fetch(url, headless=True, timeout=30000)
        status = page.status
        if status == 200:
            return record(f"Fetcher {label}", "PASS", f"status=200 len={len(page.text or '')}")
        return record(f"Fetcher {label}", "FAIL", f"status={status}")
    except Exception as e:
        return record(f"Fetcher {label}", "FAIL", str(e)[:120])


def test_stealthy(url, label):
    """Test StealthyFetcher (anti-bot bypass)."""
    try:
        page = StealthyFetcher.fetch(url, headless=True, timeout=30000)
        status = page.status
        if status == 200:
            return record(f"Stealthy {label}", "PASS", f"status=200 len={len(page.text or '')}")
        return record(f"Stealthy {label}", "FAIL", f"status={status}")
    except Exception as e:
        return record(f"Stealthy {label}", "FAIL", str(e)[:120])


def main():
    print("=== TITAN Scrapling Smoke Test ===\n")
    print("Testing 2 fetchers x 4 targets = 8 attempts\n")

    # Light tests first (Fetcher) to avoid burning time on slow stealth
    test_fetcher(IG_TEST_PROFILE, "IG profile")
    time.sleep(1)
    test_fetcher(IG_TEST_POST, "IG post")
    time.sleep(1)
    test_fetcher(TT_TEST_PROFILE, "TT profile")
    time.sleep(1)
    test_fetcher(TT_TEST_POST, "TT post")

    # Heavy tests
    print("\n--- StealthyFetcher (slower, anti-bot) ---\n")
    test_stealthy(IG_TEST_PROFILE, "IG profile")
    time.sleep(2)
    test_stealthy(IG_TEST_POST, "IG post")
    time.sleep(2)
    test_stealthy(TT_TEST_PROFILE, "TT profile")
    time.sleep(2)
    test_stealthy(TT_TEST_POST, "TT post")

    # Summary
    print("\n=== Summary ===")
    pass_n = sum(1 for r in results if r["status"] == "PASS")
    fail_n = sum(1 for r in results if r["status"] == "FAIL")
    print(f"Total: {len(results)} | PASS: {pass_n} | FAIL: {fail_n}")
    if fail_n > 0:
        print("\nFAIL details:")
        for r in results:
            if r["status"] == "FAIL":
                print(f"  {r['name']}: {r['detail']}")
        sys.exit(1)
    print("\nAll Scrapling fetchers working. Safe to integrate as new provider.")


if __name__ == "__main__":
    main()
