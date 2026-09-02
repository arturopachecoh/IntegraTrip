import base64
import hashlib
import secrets

code_verifier = secrets.token_urlsafe(64)
code_challenge = base64.urlsafe_b64encode(
    hashlib.sha256(code_verifier.encode()).digest()
).decode().rstrip("=")

print("code_verifier:", code_verifier)
print("code_challenge:", code_challenge)