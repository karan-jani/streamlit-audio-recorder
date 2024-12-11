import os
import numpy as np
import streamlit as st
from io import BytesIO
import streamlit.components.v1 as components


def st_audiorec():
    parent_dir = os.path.dirname(os.path.abspath(__file__))
    build_dir = os.path.join(parent_dir, "frontend/build")
    st_audiorec = components.declare_component("st_audiorec", path=build_dir)

    raw_audio_data = st_audiorec()
    wav_bytes = None

    if isinstance(raw_audio_data, dict):
        with st.spinner('retrieving audio-recording...'):
            audio_format = raw_audio_data.get('format', 'audio/webm')
            
            # Convert array data
            indices = np.array(list(raw_audio_data['arr'].keys()), dtype=int)
            audio_data = np.array(list(raw_audio_data['arr'].values()))
            sorted_data = audio_data[np.argsort(indices)]
            
            # Create bytes object
            wav_bytes = bytes(sorted_data.astype(np.uint8).tobytes())

    return wav_bytes