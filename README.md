upload-deno
---

Inspired by https://file.io you can now upload files to https://file.deno.dev and they will be available for some time.

An example use case is uploading files to Airtable which requires you to host the file for a couple of seconds. 

```tsx
<input type="file" />
<img>

async function upload() {
  // Upload
  const body = new FormData()
  body.append('file', document.querySelector('[type=file]').files[0])
  const uploaded = await fetch('https://file.deno.dev', { method:'POST', body }).then(r => r.json())

  // Show result
  document.querySelector('img').src = 'https://file.deno.dev' + uploaded.id
  console.log('id', uploaded.id)
  console.log('contentType', uploaded.contentType)
  console.log('originalName', uploaded.originalName)
}
```