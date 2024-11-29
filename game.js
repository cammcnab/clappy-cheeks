document.addEventListener('click', (e) => {
    if (e.target !== canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    // Check for footer link click first
    if (y > canvas.height - 35 && y < canvas.height - 20) {
        const copyrightText = 'NOT © 2024 ';
        const linkText = 'FWD:FWD:FWD:';
        const totalWidth = ctx.measureText(copyrightText + linkText).width;
        const startX = canvas.width/2 - totalWidth/2;
        const linkX = startX + ctx.measureText(copyrightText).width;
        const linkWidth = ctx.measureText(linkText).width;
        
        if (x >= linkX && x <= linkX + linkWidth) {
            window.open('https://fwdfwdfwd.email', '_blank');
            return; // Important: return here to prevent game actions
        }
    }

    // Handle regular game clicks
        if (!gameStarted) {
            gameStarted = true;
            return;
        }

        if (!gameOver) {
            playFlapSound();
            cheeks.flap();
            return;
        }

    // Handle game over state
    if (Date.now() - knockoutTime > KNOCKOUT_DELAY) {
        if ('share' in navigator && isShareButtonClick(x, y)) {
            shareScreenshot();
            return;
        }

        if (credits > 0) {
            credits--;
            gameOver = false;
            knockoutTime = 0;
            score = 0;
            cheeks.y = canvas.height / 2;
            cheeks.velocity = 0;
            gloves.pairs = [];
        }
    }
});
