import React from 'react'
import clsx from 'clsx'
import styles from './styles.module.css'

type FeatureItem = {
  title: string
  Svg: React.ComponentType<React.ComponentProps<'svg'>>
  description: JSX.Element
}

const FeatureList: FeatureItem[] = [
  {
    title: 'Protect your users data',
    Svg: require('@site/static/img/undraw_security_re_a2rk.svg').default,
    description: (
      <>
        Add end-to-end encryption to your application and never transmit any
        sensitive data or file again
      </>
    ),
  },
  {
    title: 'Share sensitive data securely',
    Svg: require('@site/static/img/undraw_shared_workspace_re_3gsu.svg')
      .default,
    description: (
      <>
        Users can securely share decryption keys with other authenticated peers
      </>
    ),
  },
  {
    title: 'React integration',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        e2esdk provide devtools, hooks and providers to add e2e encryption in
        your web application
      </>
    ),
  },
]

function Feature({ title, Svg, description }: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  )
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
        <div className="row">
          <div
            className={clsx('col col--10 col--offset-1')}
            style={{ marginTop: 40 }}
          >
            <h2 className="">What is end-to-end encryption ?</h2>
            End-to-end encryption (E2EE) is a method of secure communication
            that prevents third parties from accessing data while it's
            transferred from one end system or device to another. With e2esdk,
            the data is encrypted right in the user browser and only specific
            recipients can decrypt it.
            <br />
            <br />
            [schema]
          </div>
        </div>
        <div className="row">
          <div
            className={clsx('col col--10 col--offset-1')}
            style={{ marginTop: 40 }}
          >
            <h2 className="">How does e2esdk work ?</h2>
            <p>
              e2esdk is composed of a server, responsible of securely storing
              users encrypted keys and their relations, and a TypeScript SDK to
              interact with the server REST API and encrypt/decrypt any data or
              file, right from the user browser.
              <br />
              <br />
              Once encrypted, the frontend can send the data to your web
              application backend that will store it in a database or filesystem
              of your choice.
              <br />
              <br />
              Read more in <a href="/e2esdk/docs/overview">Overview</a>
              <br />
              <br />
              [schema]
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
