import {
  ChakraProvider,
  DarkMode,
  extendTheme,
  LightMode,
  ThemeConfig,
} from '@chakra-ui/react'
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import type { ClientConfig } from '@socialgouv/e2esdk-client'
import { Client } from '@socialgouv/e2esdk-client'
import { E2ESDKClientProvider } from '@socialgouv/e2esdk-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { PortalProvider } from './components/PortalProvider'
import { E2ESdkDevtoolsView } from './view'

export class E2ESDKDevtoolsElement extends HTMLElement {
  readonly queryClient: QueryClient
  #client?: Client

  constructor() {
    super()
    this.queryClient = new QueryClient()
    this.attachShadow({ mode: 'open' })
  }

  connectedCallback() {
    this.render()
  }

  disconnectedCallback() {
    if (!this.shadowRoot) {
      return
    }
    const shadowMountPoint = this.shadowRoot.getElementById('e2esdk-devtools')
    if (!shadowMountPoint) {
      return
    }
    this.shadowRoot.removeChild(shadowMountPoint)
  }

  set client(client: Client) {
    if (this.#client === client) {
      return
    }
    this.#client = client
    this.render()
  }

  get themeProps() {
    const colorMode = (this.getAttribute('theme') ?? 'dark') as 'light' | 'dark'
    const config: ThemeConfig = {
      useSystemColorMode: false,
      cssVarPrefix: `--e2esdk-devtools`,
      initialColorMode: colorMode,
    }
    const theme = extendTheme({
      config,
      styles: {
        global: () => ({
          '#e2esdk-devtools': {
            fontFamily: 'body',
            lineHeight: 'base',
            color: colorMode === 'light' ? 'gray.800' : 'whiteAlpha.900',
            bg: colorMode === 'light' ? 'white' : 'gray.900',
          },
          '*::placeholder': {
            color: colorMode === 'light' ? 'gray.400' : 'whiteAlpha.400',
          },
          '*, *::before, &::after': {
            borderColor: colorMode === 'light' ? 'gray.200' : 'whiteAlpha.300',
            wordWrap: 'break-word',
          },
        }),
      },
      colors: {
        gray: {
          10: '#fafdfe',
          1000: '#121721',
        },
      },
    })
    const ForceColorMode = colorMode === 'light' ? LightMode : DarkMode
    return {
      colorMode,
      theme,
      ForceColorMode,
    }
  }

  private render() {
    if (!this.shadowRoot) {
      return
    }
    if (!this.#client) {
      const serverURL = this.getAttribute('serverURL')
      const serverSignaturePublicKey = this.getAttribute(
        'serverSignaturePublicKey'
      )
      if (!serverURL || !serverSignaturePublicKey) {
        return
      }
      this.#client = new Client({
        serverURL: serverURL,
        serverSignaturePublicKey: serverSignaturePublicKey,
        // Let the main application client deal with notifications
        handleNotifications: false,
        handleSessionRefresh: false,
      })
      console.debug(`[🔐 devtools] Created new client for Web Component with
      ├ clientId:        ${this.#client.config.clientId}
      ├ serverURL:       ${this.#client.config.serverURL}
      └ serverSignaturePublicKey: ${this.#client.encode(
        this.#client.config.serverSignaturePublicKey
      )}
      `)
    } else {
      console.debug(`[🔐 devtools] Reusing existing client for Web Component with
      ├ clientId:        ${this.#client.config.clientId}
      ├ serverURL:       ${this.#client.config.serverURL}
      └ serverSignaturePublicKey: ${this.#client.encode(
        this.#client.config.serverSignaturePublicKey
      )}
      `)
    }

    const { colorMode, theme, ForceColorMode } = this.themeProps
    const shadowMountPoint = document.createElement('aside')
    shadowMountPoint.id = `e2esdk-devtools`
    shadowMountPoint.setAttribute('data-theme', colorMode)
    shadowMountPoint.setAttribute('style', `color-scheme: ${colorMode};`)
    this.shadowRoot.appendChild(shadowMountPoint)
    const root = createRoot(shadowMountPoint)
    const cache = createCache({
      key: 'devtools',
      container: shadowMountPoint,
      insertionPoint: shadowMountPoint,
    })
    root.render(
      <CacheProvider value={cache}>
        <ChakraProvider theme={theme} cssVarsRoot={`#e2esdk-devtools`}>
          <QueryClientProvider client={this.queryClient}>
            <E2ESDKClientProvider client={this.#client}>
              <ForceColorMode>
                <PortalProvider>
                  <E2ESdkDevtoolsView />
                </PortalProvider>
              </ForceColorMode>
              {Boolean(this.getAttribute('reactQueryDevtools')) && (
                <ReactQueryDevtools />
              )}
            </E2ESDKClientProvider>
          </QueryClientProvider>
        </ChakraProvider>
      </CacheProvider>
    )
  }
}

customElements.define('e2esdk-devtools', E2ESDKDevtoolsElement)

// --

interface E2ESDKDevtoolsElementAttributes
  extends React.HTMLAttributes<HTMLElement>,
    Partial<Pick<ClientConfig, 'serverURL' | 'serverSignaturePublicKey'>> {
  theme?: 'dark' | 'light'
  reactQueryDevtools?: true
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'e2esdk-devtools': React.DetailedHTMLProps<
        E2ESDKDevtoolsElementAttributes,
        E2ESDKDevtoolsElement
      >
    }
  }
}
