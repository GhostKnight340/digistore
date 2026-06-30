const devOnlyOrderToolsFlag =
  process.env.DEV_ONLY_ORDER_TOOLS === "true" ||
  process.env.NEXT_PUBLIC_DEV_ONLY_ORDER_TOOLS === "true";

const productionDeployment =
  process.env.VERCEL_ENV === "production" ||
  process.env.NEXT_PUBLIC_VERCEL_ENV === "production" ||
  process.env.APP_ENV === "production" ||
  process.env.NEXT_PUBLIC_APP_ENV === "production";

export const DEV_ONLY_ORDER_TOOLS_ENABLED =
  !productionDeployment &&
  (process.env.NODE_ENV === "development" || devOnlyOrderToolsFlag);
