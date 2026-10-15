import sys
from pathlib import Path

from py_vapid import Vapid

PRIVATE_KEY = Path("private_key.pem")
PUBLIC_KEY = Path("public_key.pem")

if PRIVATE_KEY.exists() and "--force" not in sys.argv:
    sys.exit(f"{PRIVATE_KEY} already exists. Pass --force to replace it.")

vapid = Vapid()
vapid.generate_keys()
vapid.save_key(str(PRIVATE_KEY))
vapid.save_public_key(str(PUBLIC_KEY))

print(f"Wrote {PRIVATE_KEY} and {PUBLIC_KEY}")
print('Set VAPID_PRIVATE_KEY="private_key.pem" in local.settings.json and .env')
