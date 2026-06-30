export const DEV_ONLY_ORDER_TOOLS_ENABLED =
  process.env.NODE_ENV !== "production" &&
  (process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DEV_ONLY_ORDER_TOOLS === "true");
