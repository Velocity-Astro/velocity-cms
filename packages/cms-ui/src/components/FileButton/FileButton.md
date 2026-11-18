# FileButton

A button that opens the computer's file chooser and hands back the file that was picked.

## Use it for

- Uploading: a photo to the media library, a file to import.

## Don't use it for

- Choosing one of the site's existing images for a field: `ImagePicker`.

## Example

```tsx
<FileButton accept="image" icon={Upload} isPending={isUploading} onSelect={upload}>
  Upload a photo
</FileButton>
```
