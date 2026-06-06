import pandas as pd
import pyarrow
import fastparquet

df = pd.read_parquet('train-00000-of-00106.parquet')
# Replace 'audio_column' with the actual name of your column
print(df.columns)
print(df.head())
print(df.count())

i = 0
# Extract the actual bytes from the dictionary
while i < 1846:
    audio_bytes = df['audio'].iloc[i]['bytes']

    with open(f'data/output_{i}.mp3', 'wb') as f:
        f.write(audio_bytes)
    i += 1