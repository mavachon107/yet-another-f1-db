import React from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";

export default function CountrySelect({
  label = "Country",
  placeholder = "Search and select a country",
  options = [],
  value,
  inputValue,
  onChange,
  onInputChange,
  error = false,
  helperText = "",
  disabled = false,
}) {
  const selectedAlpha2 =
    value?.alpha2_code && typeof value.alpha2_code === "string"
      ? value.alpha2_code.toLowerCase()
      : null;
  return (
    <div>
      {label ? <label>{label}</label> : null}
      <Autocomplete
        fullWidth
        options={options}
        getOptionLabel={(option) =>
          option?.name
            ? `${option.name} (${option.code})${
                option.nationality ? ` — ${option.nationality}` : ""
              }`
            : ""
        }
        isOptionEqualToValue={(option, selected) =>
          option.code === selected.code
        }
        value={value}
        inputValue={inputValue}
        onInputChange={onInputChange}
        onChange={onChange}
        disabled={disabled}
        renderOption={(props, option) => {
          const alpha2 = option?.alpha2_code
            ? option.alpha2_code.toLowerCase()
            : null;
          return (
            <li {...props}>
              {alpha2 ? (
                <img
                  className="flag-icon"
                  src={`https://flagcdn.com/24x18/${alpha2}.png`}
                  alt={option.name ? `${option.name} flag` : "Country flag"}
                  loading="lazy"
                />
              ) : null}
              <span>{option.name}</span>
            </li>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={placeholder}
            error={error}
            helperText={helperText}
            InputProps={{
              ...params.InputProps,
              startAdornment: (
                <>
                  {selectedAlpha2 ? (
                    <img
                      className="flag-icon"
                      src={`https://flagcdn.com/24x18/${selectedAlpha2}.png`}
                      alt="Country flag"
                      loading="lazy"
                    />
                  ) : null}
                  {params.InputProps.startAdornment}
                </>
              ),
            }}
          />
        )}
      />
    </div>
  );
}
