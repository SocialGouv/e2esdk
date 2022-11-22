We may want to ship the devtools as a web component, so it can be used
in a non-React context (eg: Vue, Svelte, or next week's new JS framework).

The client instance will have to be passed as a "prop" to the web component.

Internally, it should use the same React component that is exposed, wrapped
in a E2ESDKClientContext that injects the client.

https://justinfagnani.com/2019/11/01/how-to-publish-web-components-to-npm/
https://coryrylan.com/blog/how-to-use-web-components-with-typescript-and-react
https://lit.dev/

## Structure

```
- Devtools
  - Button
  - Drawer
    - View -> May be exposed to be embedded into a React tree
      - Tabs
        - LoginTab
        - IdentityTab
          - YourIdentityPanel
          - FindUsersPanel
        - KeysTab
          - KeyListPanel
          - KeyDetailsPanel

Web component:
- e2esdk-devtools (client passed as "props")
  - ClientProvider
    - Devtools (from above)
```

## CSS Isolation with Shadow DOM

https://www.youtube.com/watch?v=M_7Pa6ndAWw
