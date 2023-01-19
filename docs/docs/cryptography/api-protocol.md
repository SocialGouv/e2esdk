# API Protocol

## Desired properties

1. [Mutual authentication](#mutual-authentication)
2. [Message integrity](#message-integrity)
3. [Limit the amount of secrecy](#minimised-secrecy) required to be held by either party
4. [Non-replayability](#non-replayability) (at a later time) of SOME requests
5. [Cacheability of responses](#cacheability)

### Mutual authentication

We want both the server to authenticate the client making API calls to the server,
but also for the client to be able to authenticate a _**genuine**_ server.

:::info

By _**genuine**_, we mean that the server sending a response is the same as
the one where we signed up.

:::

### Message integrity

The protocol must ensure that in-transit message tampering is not possible
without being detected, be it on the request or the response.

### Minimised secrecy

#### In transport

We do not want to encrypt the content of messages at a higher level than TLS,
in order for API calls to be inspectable in the browser devtools
_(no tricks up my sleeve)_.

All sensitive data (key material & secrets) is transmitted, stored and received
**encrypted**, so another layer of encryption would only benefit to _hide_ metadata
(user IDs, timestamps, fingerprints) from a man-in-the-middle placed after an
early TLS termination (load balancer, internal network).

:::tip

The server should be able to provide an internal TLS termination to limit
the exposure of clear-text metadata.

:::

#### In client authentication

We want to limit the amount of sensitive material (secrets, keys) derived from
the authentication process being held by the server (either in memory or in the
database).

Ideally, we would a system where only public information is held by the server.

:::tip

OPAQUE needs to store user secrets on the server to authenticate logins, though
in practice they are useless without their client secret counterpart. This could
be an acceptable trade-off.

:::

#### In session management

Traditional authentication methods send the client an authentication token,
which grants complete access to (or a subset of) the API for a certain TTL
duration.

Such tokens tend to become high-value targets for phishing CSRF attacks.
Therefore, their use is not planned.

## Non-replayability

Some requests may need this property.

:::caution

Which ones, and why?

:::

See [cacheability](#cacheability) below for some caveats.

:::caution

What about re-ordering and delaying responses by an attacker?
This could be exploited if multiple requests are racing in parallel, and
the attacker can control the order of responses.

-> **Concrete example?**

:::

## Cacheability

Some data can be considered immutable (or changing at very low frequency),
so cacheability is a desired property, but not at the expense of security.

May clash with non-replayability: essentially, a cache is a replay mechanism
for responses. Therefore it may not be desirable to enforce non-replayability
of responses.
