# identity-service §7 - Service Ports + Sidecars

| Component | Address | Protocol |
|-----------|---------|---------|
| identity-service HTTP | `:3000` | HTTP/1.1 + HTTP/2 |
| Cerbos PDP sidecar | `localhost:3593` | gRPC |
| OpenFGA sidecar | `localhost:8080` | REST/HTTP |
| SPIRE agent | `/run/spire/sockets/agent.sock` | Unix socket |
| Valkey | `valkey:6379` | RESP3 |
| PostgreSQL | `postgres:5432` | PostgreSQL wire |
| Temporal server | `temporal:7233` | gRPC |
| Kafka | `kafka:9092` | Kafka wire |
