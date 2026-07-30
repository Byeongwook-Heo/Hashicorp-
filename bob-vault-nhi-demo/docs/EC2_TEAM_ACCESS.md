# Event team access to the Vault EC2 instance

The Vault EC2 instance remains private: it has no public IP, no inbound SSH rule, and no shared SSH private key. Event operators use their own federated AWS identity to assume a time-bounded role and start an audited Systems Manager shell session.

## Controls

- The role can start a session only on the running `bob-vault-nhi-demo-vault` instance.
- Each approved federated source role receives only `sts:AssumeRole` and `sts:SetSourceIdentity` permission to this one event operator role.
- Only the custom `bob-vault-nhi-demo-event-operator-shell` document is allowed.
- SSH and port-forward Session Manager documents are not granted.
- Standard shell input and output stream to the KMS-encrypted `/aws/ssm/bob-vault-nhi-demo/event-operator` CloudWatch log group.
- Sessions close after 20 idle minutes or 120 total minutes.
- New role assumptions and sessions are denied after `2026-09-02T00:00:00Z`.
- The OS session uses the SSM-managed `ssm-user`. Treat access as privileged and do not print Vault recovery material, tokens, database credentials, or environment secrets.

## Add a person

Each participant must send only the output of:

```bash
aws sts get-caller-identity --query Arn --output text
```

An STS result such as:

```text
arn:aws:sts::063455554839:assumed-role/aws_example_test-developer/person@example.com
```

must be normalized to the stable IAM role ARN before it is added to `event_operator_principal_arns`:

```text
arn:aws:iam::063455554839:role/aws_example_test-developer
```

Do not exchange AWS credential files, access keys, session tokens, Vault tokens, or SSH private keys.

## Connect

Participants authenticate to AWS with their own approved credentials, set a recognizable session name, and run:

```bash
EVENT_OPERATOR_NAME=alice make event-access-connect
```

The same access can be initiated with the AWS CLI directly after assuming the `bob-vault-nhi-demo-event-operator` role. The custom session document is mandatory.

## Operator deployment

After exact participant role ARNs are reviewed and added:

```bash
make upload-source
make event-access-plan
make event-access-apply
```

Remove participant ARNs immediately when they no longer need access. The absolute expiry is defense in depth, not a substitute for prompt removal.
