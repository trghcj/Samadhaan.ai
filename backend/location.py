"""Validation for the optional map pin and address lines sent with a complaint."""
import math
import re

MAX_TEXT = 200
_PIN_RE = re.compile(r"^\d{6}$")


def _clean(value):
    value = (value or "").strip()
    return value[:MAX_TEXT] or None


def _coord(value, name, limit):
    try:
        x = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a number") from None
    if not math.isfinite(x) or not -limit <= x <= limit:
        raise ValueError(f"{name} must be between -{limit} and {limit}")
    return x


def parse_place(latitude, longitude, address_line, landmark, pincode):
    """Form strings -> {latitude, longitude, address_line, landmark, pincode}; empty strings count as absent.
    Raises ValueError (shown to the client as HTTP 400) for half a coordinate pair, out-of-range values or a bad PIN."""
    lat_s, lng_s = (latitude or "").strip(), (longitude or "").strip()
    if bool(lat_s) != bool(lng_s):
        raise ValueError("latitude and longitude must be sent together")
    lat = _coord(lat_s, "latitude", 90) if lat_s else None
    lng = _coord(lng_s, "longitude", 180) if lng_s else None

    pin = (pincode or "").strip() or None
    if pin is not None and not _PIN_RE.match(pin):
        raise ValueError("pincode must be 6 digits")

    return {"latitude": lat, "longitude": lng, "address_line": _clean(address_line), "landmark": _clean(landmark), "pincode": pin}
