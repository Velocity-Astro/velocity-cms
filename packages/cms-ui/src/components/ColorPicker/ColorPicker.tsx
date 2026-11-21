import {
  Button as AriaButton,
  ColorArea,
  ColorField,
  ColorSlider,
  ColorSwatch,
  ColorSwatchPicker,
  ColorSwatchPickerItem,
  ColorThumb,
  Dialog,
  DialogTrigger,
  FieldError,
  Input,
  Label,
  Popover,
  SliderTrack,
  Text,
  parseColor,
  type Color,
} from 'react-aria-components';
import { fieldDescriptionClass, fieldErrorClass, fieldHiddenLabelClass, fieldLabelClass, fieldRequiredMarkClass } from '../field.js';
import {
  colorPickerAreaClass,
  colorPickerDialogClass,
  colorPickerInputClass,
  colorPickerPopoverClass,
  colorPickerPresetClass,
  colorPickerPresetsClass,
  colorPickerPresetSwatchClass,
  colorPickerRowClass,
  colorPickerSliderClass,
  colorPickerSliderThumbClass,
  colorPickerSwatchButtonClass,
  colorPickerSwatchClass,
  colorPickerThumbClass,
  colorPickerTrackClass,
  colorPickerVariants,
  type ColorPickerVariants,
} from './ColorPicker.variants.js';

export interface ColorPickerProps extends ColorPickerVariants {
  /** Always given. It is read out even when it is not shown. */
  readonly label: string;
  readonly isLabelHidden?: boolean;
  /** The colour, as a hex colour (six hex digits after a hash), or nothing yet. */
  readonly value?: string;
  /** Called with the colour as a hex colour, or `undefined` when the field is emptied. */
  readonly onChange: (value: string | undefined) => void;
  /** Names the button beside the field that opens the colour area, such as "Choose a colour". */
  readonly pickLabel: string;
  /** Names the slider of hues, such as "Hue". */
  readonly hueLabel: string;
  /** Colours to offer at a press, as hex colours: a template's own palette. */
  readonly presets?: readonly string[];
  /** Names the presets, such as "Suggested colours". Needed with `presets`. */
  readonly presetsLabel?: string;
  /** Help that stays visible under the field. */
  readonly description?: string;
  /** What is wrong and how to fix it. Setting it marks the field invalid. */
  readonly errorMessage?: string;
  readonly isRequired?: boolean;
  readonly isDisabled?: boolean;
}

/**
 * Where the area and the slider start when the field holds no colour yet: a middle grey, in the colour
 * space the area works in. It is never drawn as a style, and never handed back unless someone moves it.
 */
const START = 'hsb(0, 0%, 50%)';

/** Reads a hex colour, or nothing when it is not one. */
function colourOf(value: string | undefined): Color | null {
  if (value === undefined || value === '') return null;
  try {
    return parseColor(value);
  } catch {
    return null;
  }
}

/**
 * A colour, typed as a hex colour or chosen in an area of shades and a slider of hues, or from a
 * few suggested ones. What is handed back is always a hex colour.
 */
export function ColorPicker({
  label,
  isLabelHidden = false,
  value,
  onChange,
  pickLabel,
  hueLabel,
  presets = [],
  presetsLabel,
  description,
  errorMessage,
  isRequired = false,
  isDisabled = false,
  width,
}: ColorPickerProps) {
  const colour = colourOf(value);
  const shown = colour ?? parseColor(START);
  const give = (next: Color | null) => onChange(next === null ? undefined : next.toString('hex').toLowerCase());
  const offered = presets.flatMap((preset) => (colourOf(preset) === null ? [] : [preset]));
  return (
    <ColorField
      className={colorPickerVariants({ width })}
      value={colour}
      onChange={give}
      isRequired={isRequired}
      isDisabled={isDisabled}
      isInvalid={errorMessage !== undefined}
    >
      <Label className={isLabelHidden ? fieldHiddenLabelClass : fieldLabelClass}>
        {label}
        {isRequired && (
          <span aria-hidden className={fieldRequiredMarkClass}>
            {' *'}
          </span>
        )}
      </Label>
      <div className={colorPickerRowClass}>
        <DialogTrigger>
          <AriaButton aria-label={pickLabel} isDisabled={isDisabled} className={colorPickerSwatchButtonClass}>
            <ColorSwatch color={shown} className={colorPickerSwatchClass} />
          </AriaButton>
          <Popover placement="bottom start" className={colorPickerPopoverClass}>
            <Dialog aria-label={pickLabel} className={colorPickerDialogClass}>
              <ColorArea value={shown} onChange={give} colorSpace="hsb" xChannel="saturation" yChannel="brightness" className={colorPickerAreaClass}>
                <ColorThumb className={colorPickerThumbClass} />
              </ColorArea>
              <ColorSlider value={shown} onChange={give} colorSpace="hsb" channel="hue" className={colorPickerSliderClass}>
                <Label className={fieldHiddenLabelClass}>{hueLabel}</Label>
                <SliderTrack className={colorPickerTrackClass}>
                  <ColorThumb className={colorPickerSliderThumbClass} />
                </SliderTrack>
              </ColorSlider>
              {offered.length > 0 && (
                <ColorSwatchPicker
                  aria-label={presetsLabel ?? pickLabel}
                  {...(colour !== null && { value: colour })}
                  onChange={give}
                  className={colorPickerPresetsClass}
                >
                  {offered.map((preset) => (
                    <ColorSwatchPickerItem key={preset} color={preset} className={colorPickerPresetClass}>
                      <ColorSwatch className={colorPickerPresetSwatchClass} />
                    </ColorSwatchPickerItem>
                  ))}
                </ColorSwatchPicker>
              )}
            </Dialog>
          </Popover>
        </DialogTrigger>
        <Input className={colorPickerInputClass} />
      </div>
      {description !== undefined && (
        <Text slot="description" className={fieldDescriptionClass}>
          {description}
        </Text>
      )}
      <FieldError className={fieldErrorClass}>{errorMessage}</FieldError>
    </ColorField>
  );
}
