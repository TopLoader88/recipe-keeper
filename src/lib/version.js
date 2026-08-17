/* Build stamp, injected by Vite `define` (see vite.config.js). The typeof guards
   keep this module importable anywhere `define` didn't run (tests, plain node). */

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
export const BUILD_SHA = typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev'
export const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : ''

const SHORT_VERSION = APP_VERSION.replace(/\.0$/, '')

export const VERSION_LABEL =
  `v${SHORT_VERSION}` +
  (BUILD_SHA && BUILD_SHA !== 'dev' ? ` · ${BUILD_SHA}` : '') +
  (BUILD_DATE ? ` · ${BUILD_DATE}` : '')
