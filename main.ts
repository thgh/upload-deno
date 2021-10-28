import {
  Application,
  Context,
  FormDataFile,
  Response,
  Router,
} from "https://deno.land/x/oak@v9.0.1/mod.ts";

// Memory cache
const files = new Map<string, FormDataFile>();
const requests = new Map<string, { resolves: ((f: FormDataFile) => void)[] }>();

// BroadcastChannel (compatible with local too)
const channel = broadcast();

// Request and receive files from other regions
channel.onmessage = (evt: any) => {
  const { type, pathname } = evt.data;
  if (type === "request" && files.get(pathname)) {
    channel.postMessage({ type: "response", pathname, ...files.get(pathname) });
  }
  if (type === "response") fileResponse(pathname, evt.data);
  console.log("channel", {
    ...evt.data,
    content: evt.data.content ? "snip" : undefined,
  });
};

// Read static content
const html = Deno.readTextFile(`${Deno.cwd()}/index.html`);
const favicon = Deno.readFile(`${Deno.cwd()}/favicon.ico`);

// Listen to clients
const app = new Application();
app.use(async (ctx: Context) => {
  const pathname = ctx.request.url.pathname;

  const origin = ctx.request.headers.get("origin");
  if (origin) {
    ctx.response.headers.set("Access-Control-Allow-Origin", origin);
    ctx.response.headers.set("Access-Control-Max-Age", "3600");
    if (ctx.request.method === "OPTIONS") {
      ctx.response.status = 204;
      ctx.response.body = "";
      return;
    }
  }

  if (ctx.request.method === "POST") {
    console.log("uploading", pathname);
    try {
      // Process form data
      const formData = await ctx.request.body({ type: "form-data" });
      const stream = await formData.value.read({ maxSize: 1e9 });

      // Find the first file
      const file = stream.files?.at(0);
      if (file) {
        // Save in memory
        const id = pathname !== "/"
          ? pathname
          : "/" + Math.random().toString(36).slice(2);
        console.log(
          "uploaded",
          id,
          file?.name,
          file?.filename,
          file.content?.buffer.byteLength,
        );
        ctx.response.body = { id, ...file, content: undefined };

        fileResponse(id, file);
        return;
      } else {
        console.log("stream.files", stream);
      }
    } catch (error) {
      console.log("upload error", pathname, error.message);
      ctx.response.body = { message: error.message };
      return;
    }

    // Confirm success
    console.log("404", pathname);
    ctx.response.body = { message: "File not found" };
    return;
  }

  if (pathname === "/" || ctx.request.url.searchParams.get("upload")) {
    console.log("html", pathname);
    ctx.response.body = await html;
    return;
  }
  if (pathname === "/favicon.ico") {
    ctx.response.body = await favicon;
    return;
  }
  if (pathname === "/status") {
    ctx.response.body = {
      files: [...files.keys()],
      requests: [...requests.keys()],
    };
    return;
  }

  const file = files.get(pathname);
  if (file) {
    console.log("hit", pathname);
    ctx.response.type = file.contentType;
    ctx.response.body = file.content;
    return;
  }

  try {
    const wait = Number(ctx.request.url.searchParams.get("wait")) || 5000;
    console.log("wait", pathname, wait);
    if (!wait) {
      throw new Error("File not found");
    }
    const file = await fileRequest(pathname, wait);
    ctx.response.type = file.contentType;
    ctx.response.body = file.content;
  } catch (e) {
    console.log("error", pathname, e.message);
    ctx.response.body = { message: e.message };
  }
  requests.delete(pathname);
  console.log("remaining", pathname, requests.size);
});

app.addEventListener(
  "listen",
  (e) => console.log("Listening on http://localhost:8080"),
);
await app.listen({ port: 8080 });

// Wait for a missing file
function fileRequest(pathname: string, timeout: number): Promise<FormDataFile> {
  return new Promise((resolve, reject) => {
    const request = requests.get(pathname);
    if (request) {
      request.resolves.push(resolve);
    } else {
      requests.set(pathname, { resolves: [resolve] });
    }
    channel.postMessage({
      type: "request",
      pathname,
      before: Date.now() + timeout,
    });
    setTimeout(
      () => reject(new Error("File not found after waiting")),
      timeout,
    );
  });
}

// A file has been received
function fileResponse(pathname: string, file: FormDataFile) {
  files.set(pathname, file);

  const waiting = requests.get(pathname);
  if (waiting) {
    console.log("backfill", pathname, waiting.resolves.length);
    waiting.resolves.forEach((ok) => ok(file));
    requests.delete(pathname);
  }
}

// Event emittor for deno deploy
function broadcast() {
  if (typeof BroadcastChannel !== "undefined") {
    return new BroadcastChannel("main");
  }
  return {
    onmessage(event: { data: any }) {
      console.log("Event not received", event.data);
    },
    postMessage(data: any) {
      this.onmessage({ data });
    },
  };
}
