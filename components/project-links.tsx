import { Coffee, Github, type LucideIcon } from "lucide-react";
import { siProducthunt, siX, type SimpleIcon } from "simple-icons";

type ProjectLink = {
  href: string;
  label: string;
  title: string;
  icon?: LucideIcon;
  simpleIcon?: SimpleIcon;
};

const projectLinks: ProjectLink[] = [
  {
    href: "https://github.com/apoorvdarshan/crossposter",
    label: "Star",
    title: "Star Crossposter on GitHub",
    icon: Github
  },
  {
    href: "https://x.com/apoorvdarshan",
    label: "Follow",
    title: "Follow @apoorvdarshan on X",
    simpleIcon: siX
  },
  {
    href: "https://ko-fi.com/apoorvdarshan",
    label: "Ko-fi",
    title: "Support @apoorvdarshan on Ko-fi",
    icon: Coffee
  },
  {
    href: "https://www.producthunt.com/products/crossposter-2",
    label: "Vote",
    title: "Vote for Crossposter on Product Hunt",
    simpleIcon: siProducthunt
  }
];

export function ProjectLinks() {
  return (
    <div className="project-links" aria-label="Project links">
      {projectLinks.map((link) => {
        const Icon = link.icon;

        return (
          <a
            className="project-link"
            href={link.href}
            key={link.href}
            rel="noreferrer"
            target="_blank"
            title={link.title}
          >
            {link.simpleIcon ? (
              <svg aria-hidden="true" className="project-link-brand" viewBox="0 0 24 24">
                <path d={link.simpleIcon.path} />
              </svg>
            ) : Icon ? (
              <Icon size={15} />
            ) : null}
            <span>{link.label}</span>
          </a>
        );
      })}
    </div>
  );
}
