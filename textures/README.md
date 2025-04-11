# Textures for Body Customizer

This directory contains texture files used for character customization.

## Texture List

### Base Textures

- `fabric.jpg` - Fabric
- `metal.jpg` - Metal
- `wood.jpg` - Wood
- `stone.jpg` - Stone
- `leather.jpg` - Leather

### Additional Textures

- `texture6.jpg` - Cosmic
- `texture7.jpg` - Scales
- `texture8.jpg` - Denim
- `texture9.jpg` - Marble
- `texture10.jpg` - Fur
- `texture11.jpg` - Crystal
- `texture12.jpg` - Circuit
- `texture13.jpg` - Lava
- `texture14.jpg` - Camouflage
- `texture15.jpg` - Liquid
- `texture16.jpg` - Carbon
- `texture17.jpg` - Glitch
- `texture18.jpg` - Rust
- `texture19.jpg` - Silk
- `texture20.jpg` - Metallic

## How to Modify Texture Names

To change the display names of textures without changing the file names, edit the `textureOptions` array in `js/main.js`:

```javascript
// Example:
const textureOptions = [
  // Original textures
  { name: "Fabric", url: "textures/fabric.jpg" },
  // ...

  // Modify names here while keeping urls the same
  { name: "Your Custom Name", url: "textures/texture6.jpg" },
  // ...
];
```

## Troubleshooting

If textures don't appear:

- Check that the file paths are correct
- Ensure filenames match exactly (case-sensitive)
- Verify files are valid JPG format
- Check browser console for loading errors
