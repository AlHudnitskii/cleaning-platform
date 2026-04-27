from py_vapid import Vapid

v = Vapid()
v.generate_keys()
v.save_key('private_key.pem')
v.save_public_key('public_key.pem')

print("Private key file: private_key.pem")
print("Public key file: public_key.pem")
print()
print("Add to local.settings.json:")
print(f'"VAPID_PRIVATE_KEY": "private_key.pem"')
print(f'"VAPID_PUBLIC_KEY": "public_key.pem"')
print(f'"VAPID_CLAIMS_EMAIL": "admin@cleaning.com"')
