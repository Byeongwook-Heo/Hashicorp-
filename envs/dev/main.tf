locals {
  name_prefix = "${var.project}-${var.environment}"

  default_tags = merge(var.default_tags, {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Repository  = "Byeongwook-Heo/Hashicorp-"
  })
}

module "network" {
  source = "../../modules/network"

  name_prefix              = local.name_prefix
  vpc_cidr                 = var.vpc_cidr
  azs                      = var.azs
  public_subnet_cidrs      = var.public_subnet_cidrs
  app_private_subnet_cidrs = var.app_private_subnet_cidrs
  db_private_subnet_cidrs  = var.db_private_subnet_cidrs
  create_nat_gateways      = var.create_nat_gateways
  tags                     = local.default_tags
}

module "iam" {
  source = "../../modules/iam"

  name_prefix = local.name_prefix
  tags        = local.default_tags
}

module "security" {
  source = "../../modules/security"

  name_prefix           = local.name_prefix
  vpc_id                = module.network.vpc_id
  app_port              = var.app_port
  db_port               = var.db_port
  allowed_http_cidrs    = var.allowed_http_cidrs
  allow_app_egress      = true
  allow_database_egress = false
  tags                  = local.default_tags
}

module "alb" {
  source = "../../modules/alb"

  name_prefix        = local.name_prefix
  vpc_id             = module.network.vpc_id
  public_subnet_ids  = module.network.public_subnet_ids
  security_group_ids = [module.security.alb_security_group_id]
  app_port           = var.app_port
  health_check_path  = var.health_check_path
  tags               = local.default_tags
}

module "compute" {
  source = "../../modules/compute"

  name_prefix               = local.name_prefix
  ami_id                    = var.ami_id
  instance_type             = var.app_instance_type
  key_name                  = var.key_name
  subnet_ids                = module.network.app_private_subnet_ids
  security_group_ids        = [module.security.app_security_group_id]
  iam_instance_profile_name = module.iam.instance_profile_name
  target_group_arns         = [module.alb.target_group_arn]
  desired_capacity          = var.app_desired_capacity
  min_size                  = var.app_min_size
  max_size                  = var.app_max_size
  root_volume_size          = var.app_root_volume_size
  user_data = templatefile("${path.module}/user_data/app.sh", {
    app_port    = var.app_port
    environment = var.environment
  })
  tags = local.default_tags
}

module "data" {
  source = "../../modules/data"

  name_prefix            = local.name_prefix
  subnet_ids             = module.network.db_private_subnet_ids
  security_group_ids     = [module.security.db_security_group_id]
  db_name                = var.db_name
  db_username            = var.db_username
  db_instance_class      = var.db_instance_class
  allocated_storage      = var.db_allocated_storage
  max_allocated_storage  = var.db_max_allocated_storage
  engine_version         = var.db_engine_version
  parameter_group_family = var.db_parameter_group_family
  multi_az               = var.db_multi_az
  deletion_protection    = var.db_deletion_protection
  skip_final_snapshot    = var.db_skip_final_snapshot
  tags                   = local.default_tags
}

module "vault_enterprise" {
  source = "../../modules/vault-enterprise"

  name_prefix                  = local.name_prefix
  aws_region                   = var.aws_region
  vpc_id                       = module.network.vpc_id
  vpc_cidr                     = var.vpc_cidr
  subnet_ids                   = module.network.app_private_subnet_ids
  ami_id                       = var.ami_id
  instance_type                = var.vault_instance_type
  key_name                     = var.key_name
  node_count                   = var.vault_node_count
  root_volume_size             = var.vault_root_volume_size
  vault_license_parameter_name = var.vault_license_parameter_name
  vault_init_parameter_name    = var.vault_init_parameter_name
  vault_api_allowed_cidrs      = var.vault_api_allowed_cidrs
  tags                         = local.default_tags
}

module "keycloak" {
  source = "../../modules/keycloak"

  name_prefix            = local.name_prefix
  aws_region             = var.aws_region
  vpc_id                 = module.network.vpc_id
  public_subnet_ids      = module.network.public_subnet_ids
  app_subnet_ids         = module.network.app_private_subnet_ids
  db_subnet_ids          = module.network.db_private_subnet_ids
  ami_id                 = var.ami_id
  instance_type          = var.keycloak_instance_type
  key_name               = var.key_name
  node_count             = var.keycloak_node_count
  root_volume_size       = var.keycloak_root_volume_size
  allowed_http_cidrs     = var.keycloak_allowed_http_cidrs
  keycloak_version       = var.keycloak_version
  admin_username         = var.keycloak_admin_username
  db_name                = var.keycloak_db_name
  db_username            = var.keycloak_db_username
  db_instance_class      = var.keycloak_db_instance_class
  allocated_storage      = var.keycloak_db_allocated_storage
  max_allocated_storage  = var.keycloak_db_max_allocated_storage
  engine_version         = var.db_engine_version
  parameter_group_family = var.db_parameter_group_family
  multi_az               = var.keycloak_db_multi_az
  deletion_protection    = var.keycloak_db_deletion_protection
  skip_final_snapshot    = var.keycloak_db_skip_final_snapshot
  tags                   = local.default_tags
}

module "mcp_server" {
  source = "../../modules/mcp-server"

  name_prefix               = local.name_prefix
  vpc_id                    = module.network.vpc_id
  subnet_ids                = module.network.app_private_subnet_ids
  ami_id                    = var.ami_id
  instance_type             = var.mcp_instance_type
  key_name                  = var.key_name
  iam_instance_profile_name = module.iam.instance_profile_name
  node_count                = var.mcp_node_count
  root_volume_size          = var.mcp_root_volume_size
  port                      = var.mcp_port
  tags                      = local.default_tags
}
