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
    <div className="page">
      <div className="page-header">
        <h2>{title}</h2>
        <p className="page-subtitle">{description}</p>
      </div>
    </div>
  );
}
