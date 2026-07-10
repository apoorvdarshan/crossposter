const PAGES_HOSTNAME = "crossposter.pages.dev";
const CUSTOM_HOSTNAME = "crossposter.apoorvdarshan.com";

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isPagesHostname =
      url.hostname === PAGES_HOSTNAME ||
      url.hostname.endsWith(`.${PAGES_HOSTNAME}`);

    if (isPagesHostname) {
      url.protocol = "https:";
      url.hostname = CUSTOM_HOSTNAME;
      url.port = "";
      return Response.redirect(url.toString(), 301);
    }

    return env.ASSETS.fetch(request);
  },
};

export default worker;
