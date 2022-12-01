/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_SERVER_SIGNATURE_PUBLIC_KEY: process.env.SIGNATURE_PUBLIC_KEY,
    NEXT_PUBLIC_DEPLOYMENT_URL: process.env.DEPLOYMENT_URL,
  },
  // See https://github.com/vercel/next.js/issues/41961
  webpack: (webpackConfig, { webpack }) => {
    webpackConfig.plugins.push(
      new webpack.NormalModuleReplacementPlugin(new RegExp(/\.js$/), function (
        /** @type {{ request: string }} */
        resource
      ) {
        resource.request = resource.request.replace('.js', '')
      })
    )
    return webpackConfig
  },
}

export default nextConfig
