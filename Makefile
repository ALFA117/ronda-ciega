.PHONY: build idl deploy-devnet devnet-setup frontend clean

# `anchor build` panics on native Windows (cargo-build-sbf subprocess bug,
# toolchain.rs:357 unwrap on None). `cargo build-sbf` invoked directly inside
# each program dir works fine; the IDL is generated separately.
build:
	@for dir in programs/*/; do \
		if [ -f "$$dir/Cargo.toml" ]; then \
			echo "Building $$dir"; \
			(cd "$$dir" && cargo build-sbf) || exit 1; \
		fi; \
	done

idl:
	mkdir -p target/idl target/types
	anchor idl build -p ronda_ciega -o target/idl/ronda_ciega.json -t target/types/ronda_ciega.ts

deploy-devnet:
	anchor deploy --provider.cluster devnet

devnet-setup:
	solana config set --url devnet
	solana airdrop 2

frontend:
	cd frontend && npm run dev

clean:
	rm -rf target/debug target/sbf-solana-solana
