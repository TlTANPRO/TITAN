#!/usr/bin/env python3
"""set-gh-secret.py — set a GitHub Actions repository secret via the REST API.

Encryption uses libsodium sealed box (crypto_box_seal) exactly as GitHub
expects. Value is never taken from argv (that would leak into shell history);
it comes from stdin or from an env var you set yourself.

Requires: pynacl (installed for Python314), a PAT with `repo` scope.

Usage:
  python set-gh-secret.py OWNER REPO SECRET_NAME --value-stdin
  python set-gh-secret.py OWNER REPO SECRET_NAME --value-env=IG_SESSION_COOKIE

Auth: env GH_PAT (GitHub token). If unset, prompts.
"""
import argparse
import base64
import json
import os
import sys
import urllib.request
import urllib.error

import nacl.public
from nacl.public import SealedBox, PublicKey


def api(url, token, method="GET", payload=None):
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"token {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "TITAN-set-secret")
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data=data) as resp:
            body = resp.read().decode()
            return resp.status, (json.loads(body) if body else None)
    except urllib.error.HTTPError as e:
        return e.code, (json.loads(e.read().decode()) if e.read else None)


def get_secret_value(args):
    if args.value_env:
        val = os.environ.get(args.value_env)
        if not val:
            print(f"error: env var {args.value_env} not set", file=sys.stderr)
            sys.exit(2)
        return val
    # --value-stdin: read full stdin until EOF (safe, no prompt echo)
    val = sys.stdin.read().strip()
    if not val:
        print("error: empty stdin value", file=sys.stderr)
        sys.exit(2)
    return val


def main():
    p = argparse.ArgumentParser()
    p.add_argument("owner")
    p.add_argument("repo")
    p.add_argument("secret_name")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--value-stdin", action="store_true")
    src.add_argument("--value-env", metavar="ENV_VAR")
    args = p.parse_args()

    token = os.environ.get("GH_PAT") or input("GitHub PAT: ").strip()
    if not token:
        print("error: no token", file=sys.stderr)
        sys.exit(2)

    base = f"https://api.github.com/repos/{args.owner}/{args.repo}/actions/secrets"

    code, pk = api(f"{base}/public-key", token)
    if code != 200:
        print(f"error: cannot get public key ({code}): {pk}", file=sys.stderr)
        sys.exit(2)

    value = get_secret_value(args)
    pub = PublicKey(base64.b64decode(pk["key"]))
    sealed = SealedBox(pub)
    # nacl SealedBox.encrypt = crypto_box_curve25519xsalsa20poly1305_seal
    encrypted = base64.b64encode(sealed.encrypt(value.encode("utf-8"))).decode()

    code, res = api(
        f"{base}/{args.secret_name}",
        token,
        method="PUT",
        payload={"encrypted_value": encrypted, "key_id": pk["key_id"]},
    )
    if code == 201 or code == 204:
        print(f"ok: secret {args.secret_name} set for {args.owner}/{args.repo}")
    else:
        print(f"error: set secret failed ({code}): {res}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()