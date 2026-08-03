# CGC public-key access to the Vault EC2 instance

CGC connects with a dedicated RSA 3072 `.pem` key through a hardened public bastion. The Vault EC2 instance remains private and accepts SSH only from the bastion security group.

## Controls

- The bastion uses the approved `hc-security-base-*` AMI, an encrypted root volume, IMDSv2, and an individual SSM instance role.
- Public SSH is restricted to the explicitly approved source CIDRs in `/bob-vault-nhi-demo/allowed-source-cidrs`.
- Password, keyboard-interactive, and root login are disabled.
- CGC cannot obtain a shell on the bastion; the key can only forward to `vault.bob-vault-nhi-demo.internal:22`.
- The same public key provides the `cgc` shell on Vault.
- CGC has no sudo entitlement on the Vault host.
- The public bastion key expires at `2026-09-02T00:00:00Z`, which closes the external SSH path after the event.
- The owner retains Systems Manager as a separate break-glass path.

## Private key handling

The generated private key is:

```text
CGC-bob-vault-event.pem
```

It must be transferred to CGC through an approved encrypted channel. Never send it in ordinary email or chat, upload it to GitHub, add it to an issue, or place it in the project directory.

On CGC's laptop:

```bash
chmod 400 ~/Downloads/CGC-bob-vault-event.pem
```

## SSH configuration

Add this to CGC's `~/.ssh/config`:

```sshconfig
Host bob-vault-bastion
  HostName bob-vault-bastion.byeongwook-heo.sbx.hashidemos.io
  User cgc
  IdentityFile ~/Downloads/CGC-bob-vault-event.pem
  IdentitiesOnly yes

Host bob-vault
  HostName vault.bob-vault-nhi-demo.internal
  User cgc
  IdentityFile ~/Downloads/CGC-bob-vault-event.pem
  IdentitiesOnly yes
  ProxyJump bob-vault-bastion
```

After confirming both published host-key fingerprints with the owner:

```bash
ssh bob-vault
```

The deployed ED25519 host-key fingerprints are:

```text
bob-vault-bastion  SHA256:EGudpFGiyruZ6xSnMjW++wRiKqmcKly48mECRFS9PMw
bob-vault           SHA256:bth/yiwukJPXkV3W5HZmSpQUgXWocMWkgpTvzWvDXtQ
```

Opening `ssh bob-vault-bastion` directly is intentionally denied. The bastion key permits only the SSH forwarding channel to `bob-vault`.

## Source IP

If CGC is not on an already approved network, add only CGC's current public IPv4 address as `/32`, then reapply the public-key access plan. Never open SSH to `0.0.0.0/0`.

Use the merge-safe CodeBuild target so existing approved networks are retained:

```bash
make upload-source
SOURCE_CIDR="203.0.113.10/32" make source-cidr-add
make event-ssh-plan
make event-ssh-apply
```

## Deployment

```bash
make upload-source
make event-ssh-plan
make event-ssh-apply
```
