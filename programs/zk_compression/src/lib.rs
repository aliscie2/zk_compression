use anchor_lang::prelude::*;

declare_id!("6UgTt8RZcqNmZVvUvwiPcREW9dB2yju1MTYebqRbLD4h");

#[program]
pub mod zk_compression {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
