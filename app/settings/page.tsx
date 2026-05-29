"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Plus, Save } from "lucide-react";
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
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadConfig() {
      const response = await fetch("/api/config", { cache: "no-store" });
      const body = (await response.json()) as ConfigResponse;

      setFields(body.fields || []);
      setValues(body.values || {});
      setProfiles(body.profiles || {});
      setActiveProfiles(body.activeProfiles || {});
    }

    void loadConfig();
  }, []);

  const baseFields = useMemo(
    () => fields.filter((field) => !field.requiredFor?.length),
    [fields]
  );

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
      setStatus("Saved locally.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save config.");
    } finally {
      setIsSaving(false);
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
            {baseFields.map((field) => (
              <label className="config-field" key={field.name}>
                <span>{field.label}</span>
                <input
                  type={field.secret ? "password" : "text"}
                  value={values[field.name] || ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                  placeholder={field.name}
                />
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
                <h2>{platform.label}</h2>
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
                        <input
                          type={field.secret ? "password" : "text"}
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
