#!/bin/bash
for f in miro.mp4 portal.mp4 thump.mp4 whee.mp4 wobbl.mp4 woosh.mp4 miroblack.mp4 portalblack.mp4 thumpblack.mp4 wheeblack.mp4 wobblblack.mp4 wooshblack.mp4 home_main_video.mp4 tail.mp4; do
  echo "Compressing $f..."
  ffmpeg -i "$f" -c:v libx264 -crf 28 -preset fast -c:a copy -y "${f%.mp4}_temp.mp4" 2>&1 | tail -3
  mv "${f%.mp4}_temp.mp4" "$f"
  echo "Done: $f"
done
