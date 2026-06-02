import { AtSign, Coffee, Github } from "lucide-react";

const projectLinks = [
  {
    href: "https://github.com/apoorvdarshan/crossposter",
    label: "Star",
    title: "Star Crossposter on GitHub",
    icon: Github
  },
  {
    href: "https://x.com/apoorvdarshan",
    label: "Dev X",
    title: "Meet the developer on X",
    icon: AtSign
  },
  {
    href: "https://ko-fi.com/apoorvdarshan",
    label: "Ko-fi",
    title: "Support @apoorvdarshan on Ko-fi",
    icon: Coffee
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
            <Icon size={15} />
            <span>{link.label}</span>
          </a>
        );
      })}
    </div>
  );
}
