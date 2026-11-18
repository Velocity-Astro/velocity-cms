# ImagePicker

Shows the image a field holds and lets a person choose another from the site's images.

## Use it for

- A field that points at one of the site's images: a listing's photo, an agent's portrait.
- A row of a `Repeater` that holds photos, with `isLabelHidden`.

## Don't use it for

- Choosing from a short list of words. Use `Select`.
- Showing a picture nobody changes.

## Behaviour

- The picture, its name and one button sit on a line. The button opens a window with every image.
- In the window the arrow keys move between images and Enter or a press chooses one, which closes the window.
- Escape or the close button closes it and keeps what was chosen before.
- With `onUpload`, the window has an upload button that opens the computer's file chooser. While the file is on its way the button shows a spinner. When `onUpload` resolves the window closes; when it rejects the window stays open and `uploadError` says why.
- A name that matches no image (the file was removed) is still shown, with an empty frame, so it is never dropped silently.
- Pictures are decoration here: the name beside each one is what is read out.

## Example

```tsx
<ImagePicker
  label="Cover photo"
  value={photo}
  images={images}
  onChange={setPhoto}
  chooseLabel="Choose a photo"
  changeLabel="Change"
  noneText="No photo chosen"
  dialogTitle="Choose a photo"
  closeLabel="Close"
  emptyText="This site has no photos yet."
  onUpload={uploadPhoto}
  uploadLabel="Upload a photo"
  uploadHint="JPEG, PNG or WebP, up to 4 MB."
/>
```
