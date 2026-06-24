def model_dump(model, **kwargs):
    """Compatibility shim: calls model.model_dump() (Pydantic v2) or model.dict() (v1)."""
    if hasattr(model, "model_dump"):
        return model.model_dump(**kwargs)
    return model.dict(**kwargs)
