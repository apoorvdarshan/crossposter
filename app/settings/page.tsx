"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Copy, ExternalLink, Eye, EyeOff, Plus, Save } from "lucide-react";
import { SocialLogo } from "@/components/social-logo";
import type { ConfigField } from "@/lib/config-spec";
import type { Platform } from "@/lib/types";

type ProviderProfile = {
  id: string;
  label: string;
  values: Record<string, string>;
};

type ConfigResponse = {
  fields: ConfigField[];
  values: Record<string, string>;
  profiles: Partial<Record<Platform, ProviderProfile[]>>;
  activeProfiles: Partial<Record<Platform, string>>;
  configPath?: string;
  localUrl?: string;
};

const platforms: Array<{ id: Platform; label: string }> = [
  { id: "bluesky", label: "Bluesky" },
  { id: "mastodon", label: "Mastodon" },
  { id: "devto", label: "Dev.to" },
  { id: "medium", label: "Medium" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "reddit", label: "Reddit" },
  { id: "instagram", label: "Instagram" },
  { id: "pinterest", label: "Pinterest" },
  { id: "youtube", label: "YouTube" },
  { id: "twitch", label: "Twitch" }
];

function newProfile(platform: Platform, fields: ConfigField[]): ProviderProfile {
  return {
    id: `${platform}-${Date.now()}`,
    label: `New ${platform} profile`,
    values: Object.fromEntries(fields.map((field) => [field.name, ""]))
  };
}

export default function SettingsPage() {
  const [fields, setFields] = useState<ConfigField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<Partial<Record<Platform, ProviderProfile[]>>>({});
  const [activeProfiles, setActiveProfiles] = useState<Partial<Record<Platform, string>>>({});
  const [configPath, setConfigPath] = useState("");
  const [localUrl, setLocalUrl] = useState("http://localhost:2004");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadConfig() {
      const response = await fetch("/api/config", { cache: "no-store" });
      const body = (await response.json()) as ConfigResponse;

      setFields(body.fields || []);
      setValues(body.values || {});
      setProfiles(body.profiles || {});
      setActiveProfiles(body.activeProfiles || {});
      setConfigPath(body.configPath || "");
      setLocalUrl(body.localUrl || "http://localhost:2004");
    }

    void loadConfig();
  }, []);

  const baseFields = useMemo(
    () => fields.filter((field) => !field.requiredFor?.length),
    [fields]
  );
  const displayLocalUrl = useMemo(() => {
    const port = values.POSTER_LOCAL_PORT?.trim();

    return port && /^\d+$/.test(port) ? `http://localhost:${port}` : localUrl;
  }, [localUrl, values.POSTER_LOCAL_PORT]);

  function fieldsFor(platform: Platform): ConfigField[] {
    return fields.filter((field) => field.requiredFor?.includes(platform));
  }

  function addProfile(platform: Platform) {
    const profile = newProfile(platform, fieldsFor(platform));

    setProfiles((current) => ({
      ...current,
      [platform]: [...(current[platform] || []), profile]
    }));
    setActiveProfiles((current) => ({
      ...current,
      [platform]: profile.id
    }));
  }

  function updateProfile(platform: Platform, profileId: string, nextProfile: ProviderProfile) {
    setProfiles((current) => ({
      ...current,
      [platform]: (current[platform] || []).map((profile) =>
        profile.id === profileId ? nextProfile : profile
      )
    }));
  }

  function isSecretVisible(key: string): boolean {
    return Boolean(visibleSecrets[key]);
  }

  function toggleSecret(key: string) {
    setVisibleSecrets((current) => ({
      ...current,
      [key]: !current[key]
    }));
  }

  async function saveConfig() {
    setStatus("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values, profiles, activeProfiles })
      });
      const body = (await response.json()) as ConfigResponse & { error?: string };

      if (!response.ok) {
        setStatus(body.error || "Could not save config.");
        return;
      }

      setValues(body.values || {});
      setProfiles(body.profiles || {});
      setActiveProfiles(body.activeProfiles || {});
      setConfigPath(body.configPath || "");
      setLocalUrl(body.localUrl || "http://localhost:2004");
      setStatus("Saved locally.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save config.");
    } finally {
      setIsSaving(false);
    }
  }

  async function openConfigFile() {
    setStatus("");

    try {
      const response = await fetch("/api/config/open", { method: "POST" });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setStatus(body.error || "Could not open config file.");
        return;
      }

      setStatus("Opened local config file.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open config file.");
    }
  }

  async function copyConfigPath() {
    if (!configPath) {
      setStatus("Config path is not loaded yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(configPath);
      setStatus("Copied config path.");
    } catch {
      setStatus(configPath);
    }
  }

  return (
    <main className="workspace">
      <header className="masthead">
        <div className="brand-lockup">
          <div className="mark">PX</div>
          <div>
            <p className="eyebrow">Local config</p>
            <h1>Connect Socials</h1>
          </div>
        </div>
        <div className="masthead-actions">
          <Link className="health-link" href="/">
            <ChevronLeft size={15} />
            Dashboard
          </Link>
          <button className="primary compact-button" type="button" onClick={saveConfig} disabled={isSaving}>
            <Save size={17} />
            {isSaving ? "Saving..." : "Save config"}
          </button>
        </div>
      </header>

      <section className="settings-grid">
        <section className="info-panel">
          <div className="panel-heading compact">
            <h2>Local Settings</h2>
          </div>
          <div className="config-panel">
            <p className="hint">
              Everything here is saved to <code>poster.config.local.json</code>. That file is
              gitignored and stays on this machine.
            </p>
            <div className="config-location">
              <div>
                <span>Bookmark URL</span>
                <a href={displayLocalUrl} target="_blank" rel="noreferrer">
                  {displayLocalUrl}
                  <ExternalLink size={15} />
                </a>
              </div>
              <p>Auto-start uses this same port after the next local service restart.</p>
            </div>
            <div className="config-location">
              <div>
                <span>Config file</span>
                <code>{configPath || "poster.config.local.json"}</code>
              </div>
              <div className="inline-actions">
                <button className="secondary compact-button" type="button" onClick={openConfigFile}>
                  <ExternalLink size={15} />
                  Open file
                </button>
                <button className="secondary compact-button" type="button" onClick={copyConfigPath}>
                  <Copy size={15} />
                  Copy path
                </button>
              </div>
            </div>
            {baseFields.map((field) => (
              <label className="config-field" key={field.name}>
                <span>{field.label}</span>
                <span className="secret-input">
                  <input
                    type={field.secret && !isSecretVisible(`base:${field.name}`) ? "password" : "text"}
                    value={values[field.name] || ""}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.name]: event.target.value }))
                    }
                    placeholder={field.name}
                  />
                  {field.secret ? (
                    <button
                      aria-label={
                        isSecretVisible(`base:${field.name}`) ? "Hide secret" : "Show secret"
                      }
                      type="button"
                      onClick={() => toggleSecret(`base:${field.name}`)}
                    >
                      {isSecretVisible(`base:${field.name}`) ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  ) : null}
                </span>
                <span className="field-hint">{field.help}</span>
              </label>
            ))}
          </div>
        </section>

        {platforms.map((platform) => {
          const providerFields = fieldsFor(platform.id);
          const providerProfiles = profiles[platform.id] || [];

          return (
            <section className="info-panel" key={platform.id}>
              <div className="panel-heading compact">
                <h2>
                  <SocialLogo platform={platform.id} />
                  {platform.label}
                </h2>
                <button className="secondary compact-button" type="button" onClick={() => addProfile(platform.id)}>
                  <Plus size={16} />
                  Add profile
                </button>
              </div>
              <div className="config-panel">
                {providerProfiles.length > 0 ? (
                  <label className="config-field">
                    <span>Active profile</span>
                    <select
                      value={activeProfiles[platform.id] || ""}
                      onChange={(event) =>
                        setActiveProfiles((current) => ({
                          ...current,
                          [platform.id]: event.target.value
                        }))
                      }
                    >
                      {providerProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.label}
                        </option>
                      ))}
                    </select>
                    <span className="field-hint">
                      Publishing uses the active profile for this provider.
                    </span>
                  </label>
                ) : (
                  <p className="hint">No profiles yet. Add one to connect this social locally.</p>
                )}

                {providerProfiles.map((profile) => (
                  <section className="config-group" key={profile.id}>
                    <label className="config-field">
                      <span>Profile name</span>
                      <input
                        value={profile.label}
                        onChange={(event) =>
                          updateProfile(platform.id, profile.id, {
                            ...profile,
                            label: event.target.value
                          })
                        }
                      />
                    </label>
                    {providerFields.map((field) => (
                      <label className="config-field" key={field.name}>
                        <span>{field.label}</span>
                        <span className="secret-input">
                          <input
                            type={
                              field.secret && !isSecretVisible(`${profile.id}:${field.name}`)
                                ? "password"
                                : "text"
                            }
                            value={profile.values[field.name] || ""}
                            onChange={(event) =>
                              updateProfile(platform.id, profile.id, {
                                ...profile,
                                values: {
                                  ...profile.values,
                                  [field.name]: event.target.value
                                }
                              })
                            }
                            placeholder={field.name}
                          />
                          {field.secret ? (
                            <button
                              aria-label={
                                isSecretVisible(`${profile.id}:${field.name}`)
                                  ? "Hide secret"
                                  : "Show secret"
                              }
                              type="button"
                              onClick={() => toggleSecret(`${profile.id}:${field.name}`)}
                            >
                              {isSecretVisible(`${profile.id}:${field.name}`) ? (
                                <EyeOff size={17} />
                              ) : (
                                <Eye size={17} />
                              )}
                            </button>
                          ) : null}
                        </span>
                        <span className="field-hint">{field.help}</span>
                      </label>
                    ))}
                  </section>
                ))}
              </div>
            </section>
          );
        })}
      </section>

      {status ? <p className="floating-status">{status}</p> : null}
    </main>
  );
}
