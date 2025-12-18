#![allow(unexpected_cfgs)]
#![allow(deprecated)]

use anchor_lang::prelude::*;
use light_sdk::{
    account::LightAccount,
    address::v1::derive_address,
    cpi::{v1::CpiAccounts, CpiSigner},
    derive_light_cpi_signer,
    instruction::{account_meta::CompressedAccountMeta, PackedAddressTreeInfo, ValidityProof},
    LightDiscriminator, LightHasher,
};

declare_id!("6UgTt8RZcqNmZVvUvwiPcREW9dB2yju1MTYebqRbLD4h");

pub const LIGHT_CPI_SIGNER: CpiSigner =
    derive_light_cpi_signer!("6UgTt8RZcqNmZVvUvwiPcREW9dB2yju1MTYebqRbLD4h");

#[program]
pub mod zk_compression {
    use super::*;
    use light_sdk::cpi::{v1::LightSystemProgramCpi, InvokeLightSystemProgram, LightCpiInstruction};

    /// Create a new compressed account (rent-free)
    pub fn create<'info>(
        ctx: Context<'_, '_, '_, 'info, GenericAnchorAccounts<'info>>,
        proof: ValidityProof,
        address_tree_info: PackedAddressTreeInfo,
        output_state_tree_index: u8,
        value: u64,
    ) -> Result<()> {
        let light_cpi_accounts = CpiAccounts::new(
            ctx.accounts.signer.as_ref(),
            ctx.remaining_accounts,
            crate::LIGHT_CPI_SIGNER,
        );

        let (address, address_seed) = derive_address(
            &[b"compressed_data", ctx.accounts.signer.key().as_ref()],
            &address_tree_info
                .get_tree_pubkey(&light_cpi_accounts)
                .map_err(|_| ErrorCode::AccountNotEnoughKeys)?,
            &crate::ID,
        );

        let new_address_params = address_tree_info.into_new_address_params_packed(address_seed);

        let mut compressed_account = LightAccount::<MyCompressedData>::new_init(
            &crate::ID,
            Some(address),
            output_state_tree_index,
        );

        compressed_account.owner = ctx.accounts.signer.key();
        compressed_account.value = value;

        LightSystemProgramCpi::new_cpi(LIGHT_CPI_SIGNER, proof)
            .with_light_account(compressed_account)?
            .with_new_addresses(&[new_address_params])
            .invoke(light_cpi_accounts)?;

        Ok(())
    }

    /// Update an existing compressed account
    pub fn update<'info>(
        ctx: Context<'_, '_, '_, 'info, GenericAnchorAccounts<'info>>,
        proof: ValidityProof,
        account_meta: CompressedAccountMeta,
        current_value: u64,
        new_value: u64,
    ) -> Result<()> {
        let mut compressed_account = LightAccount::<MyCompressedData>::new_mut(
            &crate::ID,
            &account_meta,
            MyCompressedData {
                owner: ctx.accounts.signer.key(),
                value: current_value,
            },
        )?;

        compressed_account.value = new_value;

        let light_cpi_accounts = CpiAccounts::new(
            ctx.accounts.signer.as_ref(),
            ctx.remaining_accounts,
            crate::LIGHT_CPI_SIGNER,
        );

        LightSystemProgramCpi::new_cpi(LIGHT_CPI_SIGNER, proof)
            .with_light_account(compressed_account)?
            .invoke(light_cpi_accounts)?;

        Ok(())
    }

    /// Delete a compressed account
    pub fn delete<'info>(
        ctx: Context<'_, '_, '_, 'info, GenericAnchorAccounts<'info>>,
        proof: ValidityProof,
        account_meta: CompressedAccountMeta,
        current_value: u64,
    ) -> Result<()> {
        let compressed_account = LightAccount::<MyCompressedData>::new_close(
            &crate::ID,
            &account_meta,
            MyCompressedData {
                owner: ctx.accounts.signer.key(),
                value: current_value,
            },
        )?;

        let light_cpi_accounts = CpiAccounts::new(
            ctx.accounts.signer.as_ref(),
            ctx.remaining_accounts,
            crate::LIGHT_CPI_SIGNER,
        );

        LightSystemProgramCpi::new_cpi(LIGHT_CPI_SIGNER, proof)
            .with_light_account(compressed_account)?
            .invoke(light_cpi_accounts)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct GenericAnchorAccounts<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
}

/// Custom data stored in compressed account (rent-free)
/// Declared as event so it's included in the Anchor IDL
#[event]
#[derive(Clone, Debug, Default, LightDiscriminator, LightHasher)]
pub struct MyCompressedData {
    #[hash]
    pub owner: Pubkey,
    pub value: u64,
}
