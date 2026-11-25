/**
 * Shared themed surface container used across AQI and Weather cards.
 */
export function SectionCard({ as: Component = "div", theme = "light", className = "", children, ...rest }) {
  const isDark = theme === "dark";
  return (
    <Component
      className={`backdrop-blur-xl p-3.5 sm:p-6 lg:p-7 rounded-3xl max-w-4xl mx-auto border transition-all duration-300 ${
        isDark
          ? "bg-slate-900/95 text-white border-slate-800 shadow-2xl"
          : "bg-white text-slate-800 border-slate-200/90 shadow-xl shadow-slate-200/50"
      } ${className}`.trim()}
      {...rest}
    >
      {children}
    </Component>
  );
}

export default SectionCard;
