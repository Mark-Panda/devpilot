import type { ReactNode } from "react";

type PlaceholderPageProps = {
  title: string;
  description?: ReactNode;
};

export default function PlaceholderPage({
  title,
  description = "建设中",
}: PlaceholderPageProps) {
  return (
    <div className="page placeholder-page">
      <div className="placeholder-page-card animate-slide-up">
        <p className="placeholder-page-eyebrow">DevPilot</p>
        <h2 className="placeholder-page-title">{title}</h2>
        <p className="placeholder-page-desc">{description}</p>
      </div>
    </div>
  );
}
