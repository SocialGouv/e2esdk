# Form submissions

e2esdk provides dedicated features for form submissions and sharing. The [full-stack example](https://github.com/SocialGouv/e2esdk/tree/beta/examples/fullstack/contact-forms) demonstrates such a scenario.

## Cover these scenarios

- Anonymous users can submit encrypted data and files
- The submitted data can be re-edited by the submitter
- Recipients can invite other recipients to read and interact on the data

## Architecture

While your web application is responsible for storing and distributing the encrypted data and files and provide the correct UI to users, the storing and distribution of decryption keys is entirely handled by e2esdk itself and only happens client-side.

### Anonymous users can POST encrypted data

```mermaid
graph LR;

subgraph Web client
    Form[Application Form]-->e2esdk-->Encrypted[Encrypted data]
end

e2esdk-->|fetch keys|e2esdkapi[e2esdk API]
e2esdkapi-->e2esdkdb[e2esdk DB]

Encrypted-->|POST|app[Application API]-->appdb[Application DB]
```

### Granted users can GET encrypted data and decrypt it

```mermaid
graph LR;

subgraph Web client
    admin[Admin interface]
    e2esdk-->Decrypt[Decrypted data]
end

admin-->|GET|app[Application API]-->appdb[Application DB]
app-->e2esdk
e2esdk-->|fetch keys|e2esdkapi[e2esdk API]
e2esdkapi-->e2esdkdb[e2esdk DB]
```

## Implementation

The example implementation use React, please read [React Integration](../getting-started/03-react.md) first.

The full implementation example is available in the [contact-forms example](https://github.com/SocialGouv/e2esdk/tree/beta/examples/fullstack/contact-forms).
